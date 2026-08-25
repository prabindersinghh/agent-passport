import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createGateway,
  saveYamlFile,
  ensureAgentStructure,
  discoveryToProjectConfig,
  createBaselineProjectPolicy,
  createPassportFromTemplate,
  SHELL_TEMPLATES,
  evaluatePolicy,
} from '../src/index.js';
import { discoverProject } from '../src/discovery.js';
import {
  projectConfigPath,
  projectPolicyPath,
  agentPassportPath,
} from '../src/paths.js';

const TEST_DIR = join(tmpdir(), `agent-passport-test-${Date.now()}`);

beforeAll(() => {
  mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'tests'), { recursive: true });
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

describe('Integration — Gateway', () => {
  it('blocks researcher from writing files', () => {
    const gw = createGateway({ cwd: TEST_DIR });
    const decision = gw.authorize({
      agentId: 'researcher',
      shellId: 'researcher',
      action: 'filesystem.write',
      resource: './src/file.ts',
    });
    expect(decision.effect).toBe('deny');
    gw.close();
  });

  it('requires approval for merge', () => {
    const gw = createGateway({ cwd: TEST_DIR });
    const decision = gw.authorize({
      agentId: 'coder',
      shellId: 'coder',
      action: 'github.merge_pr',
      resource: 'repo/test/pr/1',
    });
    expect(decision.effect).toBe('approval_required');
    gw.close();
  });

  it('denies production deploy for deployer due to project deny', () => {
    const gw = createGateway({ cwd: TEST_DIR });
    const decision = gw.authorize({
      agentId: 'deployer',
      shellId: 'deployer',
      action: 'production.deploy',
      resource: 'production/main',
    });
    expect(decision.effect).toBe('deny');
    gw.close();
  });
});

describe('Security — bypass attempts', () => {
  it('cannot escalate via session without approval record', () => {
    const gw = createGateway({ cwd: TEST_DIR });
    const decision = gw.authorize({
      agentId: 'researcher',
      shellId: 'researcher',
      action: 'production.deploy',
      resource: '*',
    });
    expect(['deny', 'approval_required']).toContain(decision.effect);
    expect(decision.effect).not.toBe('allow');
    gw.close();
  });

  it('organization deny overrides all allows', () => {
    const passport = createPassportFromTemplate(SHELL_TEMPLATES.deployer, { owner: 'x' });
    passport.permissions = { production: { deploy: true } };
    const policy = createBaselineProjectPolicy('x');
    policy.rules.push({ effect: 'allow', action: 'production.deploy', resource: '*' });
    policy.organization = {
      rules: [{ effect: 'deny', action: 'production.deploy', resource: '*', priority: 9999 }],
    };
    const decision = evaluatePolicy(
      { action: 'production.deploy', resource: '*' },
      { passport, projectPolicy: policy, approvals: [] }
    );
    expect(decision.effect).toBe('deny');
  });
});
