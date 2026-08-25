#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { agentInitCommand, agentListCommand, agentInspectCommand } from './commands/agent.js';
import { inspectCommand } from './commands/inspect.js';
import { checkCommand } from './commands/check.js';
import { policyDiffCommand, policyApproveCommand } from './commands/policy.js';
import { requestCommand, approveCommand } from './commands/approval-cmd.js';
import { runCommand, summaryCommand, demoCommand } from './commands/run.js';

const program = new Command();

program
  .name('agent-passport')
  .description('Identity, authorization, policy-enforcement, and observability for AI agents')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize Agent Passport in the current project (project-first flow)')
  .option('-y, --yes', 'Skip interactive review and activate policy')
  .option('--owner <owner>', 'Policy owner identifier', 'developer')
  .action(initCommand);

const agent = program.command('agent').description('Manage agent identities (agent-first flow)');

agent
  .command('init')
  .description('Create a new agent Passport identity')
  .requiredOption('-n, --name <name>', 'Agent name/id')
  .option('--role <role>', 'Role template: researcher|coder|reviewer|deployer|custom', 'custom')
  .option('--owner <owner>', 'Owner identifier', 'developer')
  .option('--global', 'Create in ~/.agent-passport/agents (portable identity)')
  .action(agentInitCommand);

agent.command('list').description('List agent identities').action(agentListCommand);

agent
  .command('inspect')
  .description('Inspect an agent Passport')
  .option('-n, --name <name>', 'Agent name')
  .action(agentInspectCommand);

program.command('inspect').description('Inspect project Passport configuration').action(inspectCommand);

program
  .command('check')
  .description('Check if an action would be authorized')
  .argument('<action>', 'Action to check (e.g. github.merge_pr)')
  .option('-a, --agent <agent>', 'Agent id', 'coder')
  .option('-r, --resource <resource>', 'Resource', '*')
  .option('--json', 'Output as JSON')
  .action(checkCommand);

const policy = program.command('policy').description('Policy management');

policy.command('diff').description('Show policy changes since last activation').action(policyDiffCommand);

policy.command('approve').description('Activate pending project policy').action(policyApproveCommand);

program
  .command('request')
  .description('Request approval for a protected action')
  .argument('<action>', 'Action requiring approval')
  .option('-a, --agent <agent>', 'Agent id', 'coder')
  .option('-r, --resource <resource>', 'Resource', '*')
  .option('--scope <scope>', 'Approval scope: once|session|project|permanent', 'once')
  .action(requestCommand);

program
  .command('approve')
  .description('Grant a pending approval request')
  .argument('<requestId>', 'Approval request ID')
  .option('--by <approver>', 'Approver identity', 'human')
  .action(approveCommand);

program
  .command('run')
  .description('Run an agent shell workflow')
  .option('--as <shell>', 'Shell/role to run as', 'coder')
  .option('--demo', 'Run the authentication bug fix demo workflow')
  .option('--workflow <name>', 'Named workflow: full|research|code|review|deploy')
  .action(runCommand);

program
  .command('summary')
  .description('Show machine-derived run summary')
  .option('--run <id>', 'Run ID')
  .option('--json', 'Output as JSON')
  .action(summaryCommand);

program.command('demo').description('Run the required demo workflow').action(demoCommand);

program.parse();
