import { AuditEvent, RunSummary } from './types.js';
import { AuditStore } from './audit.js';

function msBetween(start: string, end: string): number {
  return new Date(end).getTime() - new Date(start).getTime();
}

export function generateRunSummary(
  runId: string,
  events: AuditEvent[],
  projectId: string
): RunSummary {
  const runEvents = events.filter((e) => e.run_id === runId);
  if (runEvents.length === 0) {
    throw new Error(`No events found for run ${runId}`);
  }

  const timestamps = runEvents.map((e) => e.timestamp).sort();
  const duration_ms = msBetween(timestamps[0], timestamps[timestamps.length - 1]);
  const trace_id = runEvents.find((e) => e.trace_id)?.trace_id ?? 'unknown';

  const shells = new Map<
    string,
    {
      shell_id: string;
      actions_attempted: number;
      allowed: number;
      denied: number;
      approval_required: number;
      approvals_granted: number;
      files_read: number;
      files_changed: number;
      tests_run: number;
      tests_passed: number;
      tests_failed: number;
      prs_created: number;
      merges: number;
      deployments: number;
      blocked_actions: Set<string>;
    }
  >();

  const filesChanged = new Set<string>();

  function getShell(id: string) {
    if (!shells.has(id)) {
      shells.set(id, {
        shell_id: id,
        actions_attempted: 0,
        allowed: 0,
        denied: 0,
        approval_required: 0,
        approvals_granted: 0,
        files_read: 0,
        files_changed: 0,
        tests_run: 0,
        tests_passed: 0,
        tests_failed: 0,
        prs_created: 0,
        merges: 0,
        deployments: 0,
        blocked_actions: new Set(),
      });
    }
    return shells.get(id)!;
  }

  for (const event of runEvents) {
    const shellId = event.shell_id ?? 'unknown';
    const shell = getShell(shellId);

    switch (event.type) {
      case 'agent.action.requested':
        shell.actions_attempted++;
        break;
      case 'action.allowed':
        shell.allowed++;
        break;
      case 'action.denied':
        shell.denied++;
        if (event.action) shell.blocked_actions.add(event.action);
        break;
      case 'approval.requested':
        shell.approval_required++;
        break;
      case 'approval.granted':
        shell.approvals_granted++;
        break;
      case 'tool.completed':
      case 'tool.failed':
        if (event.action === 'filesystem.read') shell.files_read++;
        if (event.action === 'filesystem.write' && event.resource) {
          shell.files_changed++;
          filesChanged.add(event.resource);
        }
        if (event.action === 'tests.run') {
          shell.tests_run++;
          if (event.outcome === 'success') shell.tests_passed++;
          else shell.tests_failed++;
        }
        if (event.action === 'github.create_pr' && event.outcome === 'success') {
          shell.prs_created++;
        }
        if (event.action === 'github.merge_pr' && event.outcome === 'success') {
          shell.merges++;
        }
        if (event.action === 'production.deploy' && event.outcome === 'success') {
          shell.deployments++;
        }
        break;
      case 'artifact.change':
        if (event.resource) {
          shell.files_changed++;
          filesChanged.add(event.resource);
        }
        break;
    }
  }

  const shellSummaries = [...shells.values()].map((s) => ({
    shell_id: s.shell_id,
    actions_attempted: s.actions_attempted,
    allowed: s.allowed,
    denied: s.denied,
    approval_required: s.approval_required,
    approvals_granted: s.approvals_granted,
    files_read: s.files_read,
    files_changed: s.files_changed,
    tests_run: s.tests_run,
    tests_passed: s.tests_passed,
    tests_failed: s.tests_failed,
    prs_created: s.prs_created,
    merges: s.merges,
    deployments: s.deployments,
    blocked_actions: [...s.blocked_actions],
  }));

  const totals = shellSummaries.reduce(
    (acc, s) => {
      acc.actions_attempted += s.actions_attempted;
      acc.allowed += s.allowed;
      acc.denied += s.denied;
      acc.approval_required += s.approval_required;
      acc.approvals_granted += s.approvals_granted;
      acc.files_read += s.files_read ?? 0;
      acc.files_changed += s.files_changed ?? 0;
      acc.tests_run += s.tests_run ?? 0;
      acc.tests_passed += s.tests_passed ?? 0;
      acc.tests_failed += s.tests_failed ?? 0;
      acc.prs_created += s.prs_created ?? 0;
      acc.merges += s.merges ?? 0;
      acc.deployments += s.deployments ?? 0;
      for (const a of s.blocked_actions ?? []) {
        if (a.includes('production') || a.includes('deploy')) {
          acc.blocked_high_risk_actions.add(a);
        }
      }
      return acc;
    },
    {
      actions_attempted: 0,
      allowed: 0,
      denied: 0,
      approval_required: 0,
      approvals_granted: 0,
      approvals_denied: runEvents.filter((e) => e.type === 'approval.denied').length,
      files_read: 0,
      files_changed: 0,
      tests_run: 0,
      tests_passed: 0,
      tests_failed: 0,
      prs_created: 0,
      merges: 0,
      deployments: 0,
      blocked_high_risk_actions: new Set<string>(),
    }
  );

  const hasPendingApproval = totals.approval_required > totals.approvals_granted;
  const final_outcome = hasPendingApproval
    ? 'COMPLETED_WITH_APPROVAL_PENDING'
    : totals.denied > 0
      ? 'COMPLETED_WITH_DENIALS'
      : 'COMPLETED';

  return {
    run_id: runId,
    project_id: projectId,
    duration_ms,
    trace_id,
    shells: shellSummaries,
    totals: {
      ...totals,
      blocked_high_risk_actions: [...totals.blocked_high_risk_actions],
    },
    final_outcome,
    files_changed: [...filesChanged],
  };
}

export function summaryFromAuditStore(
  runId: string,
  audit: AuditStore,
  projectId: string
): RunSummary {
  const events = audit.readByRun(runId);
  const summary = generateRunSummary(runId, events, projectId);
  audit.emit('summary.generated', {
    run_id: runId,
    project_id: projectId,
    trace_id: summary.trace_id,
    metadata: { totals: summary.totals },
  });
  return summary;
}

export function formatRunSummary(summary: RunSummary): string {
  const lines: string[] = [
    '==================================================',
    'AGENT PASSPORT — RUN SUMMARY',
    '==================================================',
    '',
    `Run: ${summary.run_id}`,
    `Project: ${summary.project_id}`,
    '',
  ];

  for (const shell of summary.shells) {
    lines.push(shell.shell_id);
    lines.push(`  Actions: ${shell.actions_attempted}`);
    lines.push(`  Allowed: ${shell.allowed}`);
    lines.push(`  Denied: ${shell.denied}`);
    if (shell.approval_required > 0) {
      lines.push(`  Approval required: ${shell.approval_required}`);
    }
    if (shell.approvals_granted > 0) {
      lines.push(`  Approvals granted: ${shell.approvals_granted}`);
    }
    if (shell.files_read) lines.push(`  Files read: ${shell.files_read}`);
    if (shell.files_changed) lines.push(`  Files changed: ${shell.files_changed}`);
    if (shell.tests_run) {
      lines.push(
        `  Tests: ${shell.tests_run} run / ${shell.tests_passed ?? 0} passed / ${shell.tests_failed ?? 0} failed`
      );
    }
    if (shell.prs_created) lines.push(`  PRs created: ${shell.prs_created}`);
    if (shell.blocked_actions?.length) {
      lines.push(`  Blocked: ${shell.blocked_actions.join(', ')}`);
    }
    lines.push('');
  }

  const t = summary.totals;
  lines.push('TOTALS');
  lines.push(`  Files changed: ${t.files_changed}`);
  lines.push(`  Tests executed: ${t.tests_run}`);
  lines.push(`  Tests passed: ${t.tests_passed}`);
  lines.push(`  Pull requests: ${t.prs_created}`);
  lines.push(`  Approvals: ${t.approvals_granted}`);
  lines.push(`  Denied actions: ${t.denied}`);
  if (t.blocked_high_risk_actions.length) {
    lines.push(`  Blocked high-risk: ${t.blocked_high_risk_actions.join(', ')}`);
  }
  lines.push('');
  lines.push(`Duration: ${formatDuration(summary.duration_ms)}`);
  lines.push('');
  lines.push(`FINAL Status: ${summary.final_outcome}`);
  lines.push(`Trace: ${summary.trace_id}`);
  lines.push('');
  lines.push('==================================================');

  return lines.join('\n');
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min > 0) return `${min}m ${remSec}s`;
  return `${sec}s`;
}
