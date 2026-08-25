import { createGateway } from '@agent-passport/core';

export async function checkCommand(
  action: string,
  options: { agent?: string; resource?: string; json?: boolean }
): Promise<void> {
  const gateway = createGateway();
  try {
    const decision = gateway.authorize({
      agentId: options.agent ?? 'coder',
      shellId: options.agent ?? 'coder',
      action,
      resource: options.resource ?? '*',
    });

    if (options.json) {
      console.log(JSON.stringify(decision, null, 2));
    } else {
      const icons: Record<string, string> = {
        allow: '✅ ALLOW',
        approved: '✅ APPROVED',
        deny: '🚫 DENY',
        approval_required: '🔐 APPROVAL_REQUIRED',
        expired: '⏰ EXPIRED',
      };
      console.log(`\n${icons[decision.effect] ?? decision.effect}`);
      console.log(`Action:   ${action}`);
      console.log(`Resource: ${options.resource ?? '*'}`);
      console.log(`Agent:    ${options.agent ?? 'coder'}`);
      console.log(`Reason:   ${decision.reason}`);
      console.log(`Source:   ${decision.policySource ?? 'unknown'}`);
      console.log(`Rules:    ${decision.ruleIds.join(', ') || '(none)'}`);
      console.log('');
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    gateway.close();
  }
}
