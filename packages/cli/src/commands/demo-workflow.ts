import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  createGateway,
  summaryFromAuditStore,
  formatRunSummary,
  runDir,
  loadProjectConfig,
  isAgentPassportInitialized,
} from '@agent-passport/core';
import {
  createCompositeExecutor,
  createFilesystemExecutor,
  createGitHubExecutor,
  createTestsExecutor,
  createDeploymentExecutor,
} from '@agent-passport/adapters';
import {
  initTelemetry,
  startRunSpan,
  startRoleSwitchSpan,
  startPolicyCheckSpan,
  startToolCallSpan,
  endSpanSuccess,
  endSpanError,
  getTraceId,
  shutdownTelemetry,
} from '@agent-passport/telemetry';

interface WorkflowStep {
  shell: string;
  action: string;
  resource: string;
  label: string;
  parameters?: unknown;
}

const DEMO_STEPS: WorkflowStep[] = [
  { shell: 'researcher', action: 'repository.read', resource: './', label: 'Read repository' },
  { shell: 'researcher', action: 'filesystem.read', resource: './src/auth.ts', label: 'Read auth source' },
  { shell: 'coder', action: 'filesystem.write', resource: './src/auth.ts', label: 'Modify source', parameters: { content: '// fixed auth bug\n' } },
  { shell: 'coder', action: 'filesystem.write', resource: './src/session.ts', label: 'Modify session', parameters: { content: '// fixed session\n' } },
  { shell: 'coder', action: 'tests.run', resource: '*', label: 'Run tests', parameters: { count: 23, passed: 23, failed: 0 } },
  { shell: 'coder', action: 'github.create_pr', resource: 'repo/example-app', label: 'Create pull request' },
  { shell: 'reviewer', action: 'filesystem.read', resource: './src/auth.ts', label: 'Review changes' },
  { shell: 'reviewer', action: 'tests.run', resource: '*', label: 'Run review tests', parameters: { count: 23, passed: 23, failed: 0 } },
  { shell: 'reviewer', action: 'review.comment', resource: 'repo/example-app/pr/184', label: 'Review approved' },
  { shell: 'coder', action: 'github.merge_pr', resource: 'repo/example-app/pr/184', label: 'Merge pull request' },
  { shell: 'deployer', action: 'production.deploy', resource: 'production/main', label: 'Deploy production' },
];

async function executeStep(
  gateway: ReturnType<typeof createGateway>,
  executor: ReturnType<typeof createCompositeExecutor>,
  step: WorkflowStep,
  runId: string,
  traceId: string
): Promise<{ icon: string; label: string; effect: string }> {
  const toolSpan = startToolCallSpan(step.action, step.shell, step.action, step.resource);
  const policySpan = startPolicyCheckSpan(step.action, step.resource, 'pending', []);

  const result = await gateway.execute(
    {
      agentId: step.shell,
      shellId: step.shell,
      action: step.action,
      resource: step.resource,
      parameters: step.parameters,
      runId,
      traceId,
    },
    executor
  );

  endSpanSuccess(policySpan, { 'policy.decision': result.decision.effect });
  if (result.executed) endSpanSuccess(toolSpan);
  else endSpanError(toolSpan, result.decision.reason);

  let icon: string;
  if (result.decision.effect === 'allow' || result.decision.effect === 'approved') {
    icon = result.executed ? '✅' : '✅';
  } else if (result.decision.effect === 'approval_required') {
    icon = '🔐';
  } else {
    icon = '🚫';
  }

  return { icon, label: step.label, effect: result.decision.effect };
}

export async function runDemoWorkflow(): Promise<void> {
  if (!isAgentPassportInitialized()) {
    console.error('\nRun agent-passport init --yes first.\n');
    process.exit(1);
  }

  const runId = `run_${uuidv4().slice(0, 8)}`;
  const traceId = initTelemetry('agent-passport-demo');
  const gateway = createGateway();
  const project = loadProjectConfig();

  const executor = createCompositeExecutor({
    filesystem: createFilesystemExecutor({ dryRun: true }),
    github: createGitHubExecutor(184),
    tests: createTestsExecutor(),
    production: createDeploymentExecutor(),
    deployment: createDeploymentExecutor(),
    review: async (_req, _dec) => ({ success: true, resultRef: 'review:comment' }),
  });

  console.log('\n==================================================');
  console.log('AGENT PASSPORT — DEMO WORKFLOW');
  console.log('Task: Fix the authentication bug and deploy the fix');
  console.log('==================================================\n');

  const runSpan = startRunSpan(runId, project.metadata.id, traceId);
  gateway.startRun('researcher', 'researcher', runId, traceId);

  let prevShell = 'researcher';
  const results: { icon: string; label: string; effect: string }[] = [];

  for (const step of DEMO_STEPS) {
    if (step.shell !== prevShell) {
      const switchSpan = startRoleSwitchSpan(prevShell, step.shell, 'workflow transition');
      gateway.switchRole({
        fromShell: prevShell,
        toShell: step.shell,
        agentId: step.shell,
        runId,
        traceId,
        reason: 'workflow transition',
      });
      endSpanSuccess(switchSpan);
      prevShell = step.shell;
    }

    const r = await executeStep(gateway, executor, step, runId, traceId);
    results.push(r);
    console.log(`${r.icon} ${r.label.padEnd(28)} ${r.effect.toUpperCase()}`);
  }

  gateway.endRun('deployer', 'deployer', runId, traceId);
  endSpanSuccess(runSpan);

  const summary = summaryFromAuditStore(runId, gateway.audit, project.metadata.id);
  summary.trace_id = getTraceId() ?? traceId;

  mkdirSync(runDir(runId), { recursive: true });
  writeFileSync(join(runDir(runId), 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(runDir(runId), 'summary.txt'), formatRunSummary(summary));

  gateway.close();
  await shutdownTelemetry();

  console.log('\n' + formatRunSummary(summary));
  console.log(`\nRun ID: ${runId}`);
  console.log('View summary: agent-passport summary --run ' + runId);
  console.log('\nTo demonstrate changed merge behavior, edit .agent/policy.yaml');
  console.log('and add require_approval: [merge] — merge stays approval-gated,');
  console.log('deployment remains blocked by project deny rule.\n');
}
