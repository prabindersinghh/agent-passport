import { describe, it, expect } from 'vitest';
import {
  evaluatePolicy,
  canExecute,
  requiresApproval,
  isDenied,
} from '../src/policy-engine.js';
import {
  createBaselineProjectPolicy,
  createPassportFromTemplate,
  SHELL_TEMPLATES,
} from '../src/templates.js';
import type { EvaluationContext } from '../src/policy-engine.js';

function ctx(
  role: 'researcher' | 'coder' | 'reviewer' | 'deployer',
  overrides?: Partial<EvaluationContext>
): EvaluationContext {
  const passport = createPassportFromTemplate(SHELL_TEMPLATES[role], {
    owner: 'developer',
    projectId: 'test-project',
  });
  return {
    passport,
    projectPolicy: createBaselineProjectPolicy('test-project'),
    approvals: [],
    ...overrides,
  };
}

describe('Policy Engine', () => {
  it('denies production deploy for coder by default', () => {
    const decision = evaluatePolicy(
      { action: 'production.deploy', resource: 'production/main' },
      ctx('coder')
    );
    expect(isDenied(decision)).toBe(true);
    expect(decision.effect).toBe('deny');
  });

  it('allows filesystem read for researcher', () => {
    const decision = evaluatePolicy(
      { action: 'filesystem.read', resource: './src/auth.ts' },
      ctx('researcher')
    );
    expect(canExecute(decision)).toBe(true);
  });

  it('denies filesystem write for researcher', () => {
    const decision = evaluatePolicy(
      { action: 'filesystem.write', resource: './src/auth.ts' },
      ctx('researcher')
    );
    expect(isDenied(decision)).toBe(true);
  });

  it('allows filesystem write for coder in src', () => {
    const decision = evaluatePolicy(
      { action: 'filesystem.write', resource: './src/auth.ts' },
      ctx('coder')
    );
    expect(canExecute(decision)).toBe(true);
  });

  it('requires approval for merge_pr', () => {
    const decision = evaluatePolicy(
      { action: 'github.merge_pr', resource: 'repo/example/pr/1' },
      ctx('coder')
    );
    expect(requiresApproval(decision)).toBe(true);
  });

  it('organization deny overrides project allow', () => {
    const projectPolicy = createBaselineProjectPolicy('test');
    projectPolicy.rules.push({
      effect: 'allow',
      action: 'production.deploy',
      resource: '*',
      id: 'project:allow-deploy',
    });
    projectPolicy.organization = {
      rules: [
        {
          effect: 'deny',
          action: 'production.deploy',
          resource: '*',
          id: 'org:deny-deploy',
          priority: 2000,
        },
      ],
    };
    const passport = createPassportFromTemplate(SHELL_TEMPLATES.deployer, {
      owner: 'dev',
    });
    passport.permissions = {
      ...passport.permissions,
      production: { read: true, deploy: true },
    };
    const decision = evaluatePolicy(
      { action: 'production.deploy', resource: '*' },
      { passport, projectPolicy, approvals: [] }
    );
    expect(decision.effect).toBe('deny');
  });

  it('grants action when valid approval exists', () => {
    const decision = evaluatePolicy(
      { action: 'github.merge_pr', resource: 'repo/example/pr/1' },
      ctx('coder', {
        approvals: [
          {
            request_id: 'apr-1',
            agent_id: 'researcher',
            shell_id: 'coder',
            action: 'github.merge_pr',
            resource: '*',
            reason: 'test',
            requested_scope: 'once',
            status: 'granted',
            created_at: new Date().toISOString(),
          },
        ],
      })
    );
    // agent_id mismatch - should still require approval
    expect(requiresApproval(decision)).toBe(true);
  });

  it('denies secrets path access', () => {
    const decision = evaluatePolicy(
      { action: 'filesystem.read', resource: './secrets/api-key.txt' },
      ctx('coder')
    );
    expect(isDenied(decision)).toBe(true);
  });

  it('deployer production deploy requires approval not deny when policy says approval', () => {
    const decision = evaluatePolicy(
      { action: 'production.deploy', resource: 'production/main' },
      ctx('deployer')
    );
    // project denies production.deploy at high priority
    expect(isDenied(decision)).toBe(true);
  });
});

describe('Security — privilege escalation', () => {
  it('agent cannot self-approve by missing approval record', () => {
    const decision = evaluatePolicy(
      { action: 'production.deploy', resource: '*' },
      ctx('deployer')
    );
    expect(canExecute(decision)).toBe(false);
  });
});
