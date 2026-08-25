import {
  isAgentPassportInitialized,
  loadProjectConfig,
  loadProjectPolicy,
  loadPassport,
  listAgentIds,
  agentPassportPath,
} from '@agent-passport/core';

export async function inspectCommand(): Promise<void> {
  if (!isAgentPassportInitialized()) {
    console.error('\nProject not initialized. Run: agent-passport init\n');
    process.exit(1);
  }

  const project = loadProjectConfig();
  const policy = loadProjectPolicy();
  const agents = listAgentIds();

  console.log('\n=== Agent Passport — Project Inspection ===\n');
  console.log(`Project:  ${project.metadata.id}`);
  console.log(`Policy:   v${project.metadata.policy_version} ${policy.metadata.activated ? '(active)' : '(pending approval)'}`);
  if (project.metadata.repository) console.log(`Repo:     ${project.metadata.repository}`);

  if (project.discovery?.signals.length) {
    console.log('\nDiscovered:');
    for (const s of project.discovery.signals) console.log(`  ✓ ${s}`);
  }

  console.log('\nAgents:');
  for (const id of agents) {
    const p = loadPassport(agentPassportPath(id));
    console.log(`  • ${id} (${p.identity.role}) — ${p.capabilities.length} capabilities`);
  }

  console.log('\nPolicy rules:');
  for (const rule of policy.rules.slice(0, 10)) {
    const icon = rule.effect === 'allow' ? '✅' : rule.effect === 'deny' ? '🚫' : '🔐';
    console.log(`  ${icon} ${rule.action} on ${rule.resource} → ${rule.effect}`);
  }
  if (policy.rules.length > 10) console.log(`  ... and ${policy.rules.length - 10} more`);

  if (policy.require_approval?.length) {
    console.log('\nRequires approval:');
    for (const a of policy.require_approval) console.log(`  🔐 ${a}`);
  }

  if (policy.defaultDeny?.length) {
    console.log('\nDefault deny:');
    for (const a of policy.defaultDeny) console.log(`  🚫 ${a}`);
  }

  console.log('');
}
