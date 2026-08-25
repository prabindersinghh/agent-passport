import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  normalizeFsResource,
  ResourceSecurityError,
  isProtectedPath,
  createGateway,
  saveYamlFile,
  ensureAgentStructure,
  discoveryToProjectConfig,
  createBaselineProjectPolicy,
  createPassportFromTemplate,
  SHELL_TEMPLATES,
  createMemoryStore,
  projectConfigPath,
  projectPolicyPath,
  agentPassportPath,
  discoverProject,
} from '../src/index.js';

describe('Security — path normalization', () => {
  it('normalizes relative paths', () => {
    expect(normalizeFsResource('src/auth.ts')).toBe('./src/auth.ts');
    expect(normalizeFsResource('./src/../src/a.ts')).toBe('./src/a.ts');
  });

  it('rejects path traversal', () => {
    expect(() => normalizeFsResource('../etc/passwd')).toThrow(ResourceSecurityError);
    expect(() => normalizeFsResource('./src/../../secret')).toThrow(ResourceSecurityError);
  });

  it('rejects absolute paths', () => {
    expect(() => normalizeFsResource('/etc/passwd')).toThrow(ResourceSecurityError);
    expect(() => normalizeFsResource('C:\\Windows\\System32')).toThrow(ResourceSecurityError);
  });

  it('rejects null bytes', () => {
    expect(() => normalizeFsResource('./src/\0evil')).toThrow(ResourceSecurityError);
  });

  it('rejects double-encoded traversal', () => {
    expect(() => normalizeFsResource('%2e%2e/%2e%2e/etc/passwd')).toThrow(ResourceSecurityError);
  });

  it('flags protected paths', () => {
    expect(isProtectedPath('./.agent/policy.yaml')).toBe(true);
    expect(isProtectedPath('./.env')).toBe(true);
    expect(isProtectedPath('./src/a.ts')).toBe(false);
  });
});

describe('Security — memory never grants authority', () => {
  it('MemoryStore.grantsAuthority is always false', () => {
    const dir = join(tmpdir(), `ap-mem-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    ensureAgentStructure(dir);
    const mem = createMemoryStore('coder', dir);
    mem.append({ kind: 'note', content: 'I deployed production yesterday' });
    expect(mem.grantsAuthority()).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

const TEST_DIR = join(tmpdir(), `agent-passport-sec-${Date.now()}`);

beforeAll(() => {
  mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'src', 'a.ts'), 'export {}');
  ensureAgentStructure(TEST_DIR);
  const discovery = discoverProject(TEST_DIR);
  saveYamlFile(projectConfigPath(TEST_DIR), discoveryToProjectConfig(discovery));
  const policy = createBaselineProjectPolicy('test-project');
  policy.metadata.activated = true;
  saveYamlFile(projectPolicyPath(TEST_DIR), policy);
  for (const role of ['researcher', 'coder', 'reviewer', 'deployer'] as const) {
    saveYamlFile(
      agentPassportPath(role, TEST_DIR),
      createPassportFromTemplate(SHELL_TEMPLATES[role], { owner: 'test', projectId: 'test-project' })
    );
  }
});

afterAll(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Security — gateway hardening', () => {
  it('denies path traversal via authorize', () => {
    const gw = createGateway({ cwd: TEST_DIR });
    const d = gw.authorize({
      agentId: 'coder',
      shellId: 'coder',
      action: 'filesystem.read',
      resource: '../outside.ts',
    });
    expect(d.effect).toBe('deny');
    gw.close();
  });

  it('denies write to .agent/policy.yaml', () => {
    const gw = createGateway({ cwd: TEST_DIR });
    const d = gw.authorize({
      agentId: 'coder',
      shellId: 'coder',
      action: 'filesystem.write',
      resource: './.agent/policy.yaml',
    });
    expect(d.effect).toBe('deny');
    expect(d.ruleIds).toContain('security:protected-path');
    gw.close();
  });

  it('consumes once-scoped approval after use', async () => {
    const gw = createGateway({ cwd: TEST_DIR });
    const req = gw.approvals.createRequest({
      agentId: 'coder',
      shellId: 'coder',
      action: 'github.merge_pr',
      resource: '*',
      reason: 'test',
      scope: 'once',
    });
    gw.approvals.grant(req.request_id, 'human');
    const first = gw.authorize({
      agentId: 'coder',
      shellId: 'coder',
      action: 'github.merge_pr',
      resource: 'repo/x/pr/1',
    });
    expect(first.effect).toBe('approved');
    expect(first.approvalRequestId).toBe(req.request_id);

    await gw.execute(
      {
        agentId: 'coder',
        shellId: 'coder',
        action: 'github.merge_pr',
        resource: 'repo/x/pr/1',
      },
      async () => ({ success: true, resultRef: 'ok' })
    );

    const second = gw.authorize({
      agentId: 'coder',
      shellId: 'coder',
      action: 'github.merge_pr',
      resource: 'repo/x/pr/1',
    });
    expect(second.effect).toBe('approval_required');
    gw.close();
  });
});

describe('Audit append-only (INV-10)', () => {
  it('AuditStore has no update or delete API', async () => {
    const { AuditStore } = await import('../src/audit.js');
    const proto = AuditStore.prototype as Record<string, unknown>;
    expect(typeof proto.append).toBe('function');
    expect(proto.update).toBeUndefined();
    expect(proto.delete).toBeUndefined();
    expect(proto.remove).toBeUndefined();
  });
});
