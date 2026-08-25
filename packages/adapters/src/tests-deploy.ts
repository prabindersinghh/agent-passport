import type { ToolOutcome, ToolRequest, PolicyDecision } from '@agent-passport/core';

export class TestsAdapter {
  async execute(request: ToolRequest, _decision: PolicyDecision): Promise<ToolOutcome> {
    if (request.action !== 'tests.run') {
      return { success: false, errorCode: 'NOT_TEST_ACTION' };
    }

    const params = (request.parameters ?? {}) as { count?: number; passed?: number; failed?: number };
    const count = params.count ?? 12;
    const passed = params.passed ?? count - 1;
    const failed = params.failed ?? count - passed;

    return {
      success: failed === 0,
      resultRef: `tests:${count}:${passed}:${failed}`,
    };
  }
}

export class DeploymentAdapter {
  async execute(request: ToolRequest, decision: PolicyDecision): Promise<ToolOutcome> {
    if (!request.action.startsWith('production.') && !request.action.startsWith('deployment.')) {
      return { success: false, errorCode: 'NOT_DEPLOYMENT_ACTION' };
    }

    if (decision.effect === 'deny') {
      return { success: false, errorCode: 'POLICY_DENIED', resultRef: decision.reason };
    }

    return {
      success: true,
      resultRef: `deploy:${request.resource}`,
    };
  }
}

export function createTestsExecutor() {
  const adapter = new TestsAdapter();
  return (req: ToolRequest, dec: PolicyDecision) => adapter.execute(req, dec);
}

export function createDeploymentExecutor() {
  const adapter = new DeploymentAdapter();
  return (req: ToolRequest, dec: PolicyDecision) => adapter.execute(req, dec);
}

export function createCompositeExecutor(
  executors: Record<string, (req: ToolRequest, dec: PolicyDecision) => Promise<ToolOutcome>>
): (req: ToolRequest, dec: PolicyDecision) => Promise<ToolOutcome> {
  return async (req, dec) => {
    const prefix = req.action.split('.')[0];
    const executor =
      executors[req.action] ??
      executors[prefix] ??
      executors['*'];
    if (!executor) {
      return { success: false, errorCode: 'NO_EXECUTOR' };
    }
    return executor(req, dec);
  };
}
