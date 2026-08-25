import { createGateway } from '@agent-passport/core';
import type { ApprovalScope } from '@agent-passport/core';

export async function requestCommand(
  action: string,
  options: { agent?: string; resource?: string; scope?: string }
): Promise<void> {
  const gateway = createGateway();
  try {
    const decision = gateway.authorize({
      agentId: options.agent ?? 'coder',
      shellId: options.agent ?? 'coder',
      action,
      resource: options.resource ?? '*',
    });

    if (decision.effect !== 'approval_required') {
      console.log(`\nAction does not require approval. Decision: ${decision.effect}`);
      console.log(`Reason: ${decision.reason}\n`);
      return;
    }

    const req = gateway.approvals.createRequest({
      agentId: options.agent ?? 'coder',
      shellId: options.agent ?? 'coder',
      action,
      resource: options.resource ?? '*',
      reason: decision.reason,
      scope: (options.scope ?? 'once') as ApprovalScope,
    });

    console.log('\n🔐 HUMAN APPROVAL REQUIRED\n');
    console.log(`Request ID: ${req.request_id}`);
    console.log(`Action:     ${action}`);
    console.log(`Resource:   ${options.resource ?? '*'}`);
    console.log(`Scope:      ${req.requested_scope}`);
    console.log(`\nApprove with: agent-passport approve ${req.request_id}\n`);
  } finally {
    gateway.close();
  }
}

export async function approveCommand(requestId: string, options: { by?: string }): Promise<void> {
  const gateway = createGateway();
  try {
    const result = gateway.approvals.grant(requestId, options.by ?? 'human');
    if (!result) {
      console.error('\nApproval request not found or already decided.\n');
      process.exit(1);
    }
    gateway.audit.emit('approval.granted', {
      agent_id: result.agent_id,
      shell_id: result.shell_id,
      action: result.action,
      resource: result.resource,
      decision: 'granted',
      metadata: { request_id: requestId, decided_by: options.by ?? 'human' },
    });
    console.log('\n✅ Approval granted\n');
    console.log(`Request:  ${requestId}`);
    console.log(`Action:   ${result.action}`);
    console.log(`Resource: ${result.resource}`);
    console.log(`Scope:    ${result.requested_scope}`);
    console.log(`By:       ${options.by ?? 'human'}\n`);
  } finally {
    gateway.close();
  }
}
