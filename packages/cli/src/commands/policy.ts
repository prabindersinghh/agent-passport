import { loadProjectPolicy, saveYamlFile, projectPolicyPath } from '@agent-passport/core';

export async function policyDiffCommand(): Promise<void> {
  const policy = loadProjectPolicy();
  console.log('\n=== Policy Status ===\n');
  console.log(`Version:   ${policy.metadata.version}`);
  console.log(`Activated: ${policy.metadata.activated ? 'yes' : 'no'}`);
  if (policy.metadata.activatedAt) console.log(`Activated: ${policy.metadata.activatedAt}`);
  console.log(`Rules:     ${policy.rules.length}`);
  console.log('\nPending activation — run: agent-passport policy approve\n');
}

export async function policyApproveCommand(): Promise<void> {
  const policy = loadProjectPolicy();
  if (policy.metadata.activated) {
    console.log('\nPolicy is already active.\n');
    return;
  }
  policy.metadata.activated = true;
  policy.metadata.activatedAt = new Date().toISOString();
  saveYamlFile(projectPolicyPath(), policy);
  console.log('\n✅ Project policy activated and versioned.\n');
}
