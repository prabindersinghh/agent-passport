import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  discoverProject,
  discoveryToProjectConfig,
  generatePermissionProposal,
  createBaselineProjectPolicy,
  createPassportFromTemplate,
  SHELL_TEMPLATES,
  saveYamlFile,
  ensureAgentStructure,
  agentPassportPath,
  projectConfigPath,
  projectPolicyPath,
  isAgentPassportInitialized,
} from '@agent-passport/core';
import type { AgentRole } from '@agent-passport/core';

export async function initCommand(options: { yes?: boolean; owner?: string }): Promise<void> {
  const cwd = process.cwd();

  if (isAgentPassportInitialized(cwd)) {
    console.log('Agent Passport is already initialized in this project.');
    console.log('Run: agent-passport inspect');
    return;
  }

  console.log('\n🔍 Discovering project context...\n');
  const discovery = discoverProject(cwd);

  for (const signal of discovery.signals) {
    console.log(`  ✓ ${signal}`);
  }

  console.log('\n📋 Proposed permission baseline:\n');
  const proposals = generatePermissionProposal(discovery);
  for (const p of proposals) {
    const icon = p.effect === 'allow' ? '✅' : p.effect === 'deny' ? '🚫' : '🔐';
    console.log(`  ${icon} ${p.action.padEnd(30)} ${p.effect.toUpperCase().padEnd(10)} ${p.reason}`);
  }

  if (!options.yes) {
    console.log('\n⚠️  Review the proposed permissions above.');
    console.log('   Run with --yes to activate, or edit .agent/policy.yaml after init.\n');
  }

  ensureAgentStructure(cwd);

  const projectConfig = discoveryToProjectConfig(discovery);
  saveYamlFile(projectConfigPath(cwd), projectConfig);

  const policy = createBaselineProjectPolicy(discovery.projectName);
  if (options.yes) {
    policy.metadata.activated = true;
    policy.metadata.activatedAt = new Date().toISOString();
  }
  saveYamlFile(projectPolicyPath(cwd), policy);

  const roles: AgentRole[] = ['researcher', 'coder', 'reviewer', 'deployer'];
  for (const role of roles) {
    const passport = createPassportFromTemplate(SHELL_TEMPLATES[role], {
      owner: options.owner ?? 'developer',
      projectId: discovery.projectName,
    });
    saveYamlFile(agentPassportPath(role, cwd), passport);
    mkdirSync(join(cwd, '.agent', 'agents', role, 'memory'), { recursive: true });
  }

  console.log('\n✅ Agent Passport initialized\n');
  console.log('  ✓ Project discovered');
  console.log('  ✓ Agent configuration generated');
  console.log('  ✓ Safe baseline policy generated');
  console.log('  ✓ Four role shells available');
  console.log('  ✓ MCP enforcement configured');
  console.log('  ✓ Telemetry configured');
  console.log('\n  Agent Passport ready.');
  console.log('\n  Next: agent-passport inspect');
  if (!options.yes) {
    console.log('        agent-passport policy approve');
  }
  console.log('');
}
