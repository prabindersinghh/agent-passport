import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import {
  saveYamlFile,
  ensureAgentStructure,
  discoveryToProjectConfig,
  createBaselineProjectPolicy,
  createPassportFromTemplate,
  SHELL_TEMPLATES,
  discoverProject,
  projectConfigPath,
  projectPolicyPath,
  agentPassportPath,
} from '@agent-passport/core';
import { createHttpServer } from './server.js';
import { z } from 'zod';

const TEST_DIR = join(tmpdir(), `agent-passport-http-test-${Date.now()}`);

const HttpPolicyDecisionSchema = z.object({
  decision: z.string(),
  effect: z.enum(['allow', 'deny', 'approval_required', 'approved', 'expired']),
  reason: z.string(),
  agent: z.string(),
  ruleIds: z.array(z.string()),
  policySource: z.string().optional(),
  approvalRequestId: z.string().optional(),
  trace_id: z.string(),
});

beforeAll(() => {
  mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'tests'), { recursive: true });
  ensureAgentStructure(TEST_DIR);
  const discovery = discoverProject(TEST_DIR);
  saveYamlFile(projectConfigPath(TEST_DIR), discoveryToProjectConfig(discovery));
  const policy = createBaselineProjectPolicy('http-test-project');
  policy.metadata.activated = true;
  saveYamlFile(projectPolicyPath(TEST_DIR), policy);
  for (const role of ['researcher', 'coder', 'reviewer', 'deployer'] as const) {
    saveYamlFile(
      agentPassportPath(role, TEST_DIR),
      createPassportFromTemplate(SHELL_TEMPLATES[role], {
        owner: 'test',
        projectId: 'http-test-project',
      })
    );
  }
});

afterAll(() => {
  // SQLite may briefly hold the lock on Windows; best-effort cleanup
  try {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    /* ignore EBUSY */
  }
});

describe('@agent-passport/http', () => {
  it('POST /v1/authorize returns DENY for researcher filesystem.write', async () => {
    const { app, gateway } = createHttpServer({ cwd: TEST_DIR });
    try {
      const res = await request(app)
        .post('/v1/authorize')
        .send({
          agentId: 'researcher',
          action: 'filesystem.write',
          resource: './src/file.ts',
          traceId: 'trace-http-deny-1',
        })
        .expect(200);

      const body = HttpPolicyDecisionSchema.parse(res.body);
      expect(body.decision).toBe('DENY');
      expect(body.effect).toBe('deny');
      expect(body.agent).toBe('researcher');
      expect(body.trace_id).toBe('trace-http-deny-1');
    } finally {
      gateway.close();
    }
  });

  it('rejects invalid authorize body with fail-closed DENY schema', async () => {
    const { app, gateway } = createHttpServer({ cwd: TEST_DIR });
    try {
      const res = await request(app)
        .post('/v1/authorize')
        .send({ agentId: 'coder' })
        .expect(400);

      const body = HttpPolicyDecisionSchema.parse(res.body);
      expect(body.decision).toBe('DENY');
      expect(body.effect).toBe('deny');
      expect(body.ruleIds).toContain('fail-closed');
    } finally {
      gateway.close();
    }
  });

  it('GET /health returns ok', async () => {
    const { app, gateway } = createHttpServer({ cwd: TEST_DIR });
    try {
      const res = await request(app).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    } finally {
      gateway.close();
    }
  });
});
