import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentPassport,
  saveYamlFile,
  loadPassport,
  listAgentIds,
  agentPassportPath,
  isAgentPassportInitialized,
} from '@agent-passport/core';
import type { AgentRole } from '@agent-passport/core';

function globalAgentPath(name: string): string {
  return join(homedir(), '.agent-passport', 'agents', name, 'passport.yaml');
}

export async function agentInitCommand(options: {
  name: string;
  role?: string;
  owner?: string;
  global?: boolean;
}): Promise<void> {
  const role = (options.role ?? 'custom') as AgentRole;
  const passport = createAgentPassport(options.name, {
    owner: options.owner ?? 'developer',
    role,
  });

  if (options.global) {
    const path = globalAgentPath(options.name);
    mkdirSync(join(path, '..'), { recursive: true });
    saveYamlFile(path, passport);
    console.log(`\n✅ Agent Passport created: ${path}`);
    console.log('\nNo authority granted — attach to a project to assign permissions.');
    console.log(`\n  agent-passport agent inspect --name ${options.name}`);
    return;
  }

  if (isAgentPassportInitialized()) {
    saveYamlFile(agentPassportPath(options.name), passport);
    console.log(`\n✅ Agent '${options.name}' added to project`);
  } else {
    const path = globalAgentPath(options.name);
    mkdirSync(join(path, '..'), { recursive: true });
    saveYamlFile(path, passport);
    console.log(`\n✅ Agent Passport created (portable): ${path}`);
    console.log('\nRun agent-passport init in a project, then attach this agent.');
  }

  console.log('\n⚠️  No implicit privileged capabilities — authority comes from project policy.');
}

export async function agentListCommand(): Promise<void> {
  const ids = listAgentIds();
  const globalDir = join(homedir(), '.agent-passport', 'agents');
  const globalIds = existsSync(globalDir)
    ? readdirSync(globalDir).filter((n: string) => existsSync(join(globalDir, n, 'passport.yaml')))
    : [];

  console.log('\nProject agents:');
  if (ids.length === 0) console.log('  (none — run agent-passport init)');
  for (const id of ids) console.log(`  • ${id}`);

  console.log('\nPortable agents (~/.agent-passport/agents):');
  if (globalIds.length === 0) console.log('  (none — run agent-passport agent init --global)');
  for (const id of globalIds) console.log(`  • ${id}`);
  console.log('');
}

export async function agentInspectCommand(options: { name?: string }): Promise<void> {
  const name = options.name;
  if (!name) {
    console.error('Specify --name <agent>');
    process.exit(1);
  }

  let path = agentPassportPath(name);
  if (!existsSync(path)) {
    path = globalAgentPath(name);
  }
  if (!existsSync(path)) {
    console.error(`Agent not found: ${name}`);
    process.exit(1);
  }

  const passport = loadPassport(path);
  console.log('\n=== Agent Passport ===\n');
  console.log(`ID:      ${passport.metadata.id}`);
  console.log(`Role:    ${passport.identity.role}`);
  console.log(`Owner:   ${passport.identity.owner}`);
  console.log(`Project: ${passport.metadata.project ?? '(not attached)'}`);
  console.log('\nCapabilities:');
  for (const c of passport.capabilities) console.log(`  • ${c}`);
  console.log('\nPermissions:');
  console.log(JSON.stringify(passport.permissions, null, 2));
  console.log('');
}
