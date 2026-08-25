import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  createGateway,
  summaryFromAuditStore,
  formatRunSummary,
  runDir,
  loadProjectConfig,
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
import { runDemoWorkflow } from './demo-workflow.js';

export async function runCommand(options: {
  as?: string;
  demo?: boolean;
  workflow?: string;
}): Promise<void> {
  if (options.demo || options.workflow === 'full') {
    await runDemoWorkflow();
    return;
  }

  const shell = options.as ?? 'coder';
  const runId = `run_${Date.now().toString(36)}`;
  const traceId = initTelemetry('agent-passport-cli');
  const gateway = createGateway();
  const project = loadProjectConfig();

  const executor = createCompositeExecutor({
    filesystem: createFilesystemExecutor(),
    github: createGitHubExecutor(),
    tests: createTestsExecutor(),
    production: createDeploymentExecutor(),
    deployment: createDeploymentExecutor(),
  });

  const runSpan = startRunSpan(runId, project.metadata.id, traceId);
  gateway.startRun(shell, shell, runId, traceId);

  console.log(`\n▶ Running as ${shell} (run: ${runId})\n`);

  try {
    const result = await gateway.execute(
      {
        agentId: shell,
        shellId: shell,
        action: 'repository.read',
        resource: './',
        runId,
        traceId,
      },
      executor
    );
    const policySpan = startPolicyCheckSpan(
      'repository.read',
      './',
      result.decision.effect,
      result.decision.ruleIds
    );
    if (result.executed) endSpanSuccess(policySpan);
    else endSpanError(policySpan, result.decision.reason);

    console.log(`repository.read → ${result.decision.effect}`);
  } finally {
    gateway.endRun(shell, shell, runId, traceId);
    endSpanSuccess(runSpan, { 'agent.shell': shell });
    gateway.close();

    const summary = summaryFromAuditStore(runId, gateway.audit, project.metadata.id);
    summary.trace_id = getTraceId() ?? traceId;
    mkdirSync(runDir(runId), { recursive: true });
    writeFileSync(join(runDir(runId), 'summary.json'), JSON.stringify(summary, null, 2));
    writeFileSync(join(runDir(runId), 'summary.txt'), formatRunSummary(summary));

    await shutdownTelemetry();
    console.log(formatRunSummary(summary));
  }
}

export async function summaryCommand(options: { run?: string; json?: boolean }): Promise<void> {
  const gateway = createGateway();
  try {
    const project = loadProjectConfig();
    let runId = options.run;

    if (!runId) {
      const runsPath = join(process.cwd(), '.agent', 'runs');
      if (!existsSync(runsPath)) {
        console.error('No runs found.');
        process.exit(1);
      }
      const runs = readdirSync(runsPath).sort().reverse();
      runId = runs[0];
    }

    if (!runId) {
      console.error('No run ID specified.');
      process.exit(1);
    }

    const summaryPath = join(runDir(runId), 'summary.json');
    if (existsSync(summaryPath)) {
      const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
      if (options.json) console.log(JSON.stringify(summary, null, 2));
      else console.log(formatRunSummary(summary));
      return;
    }

    const summary = summaryFromAuditStore(runId, gateway.audit, project.metadata.id);
    if (options.json) console.log(JSON.stringify(summary, null, 2));
    else console.log(formatRunSummary(summary));
  } finally {
    gateway.close();
  }
}

export async function demoCommand(): Promise<void> {
  await runDemoWorkflow();
}
