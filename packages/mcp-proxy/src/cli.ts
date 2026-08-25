#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { McpPassportProxy, loadProxyConfig, type McpProxyConfig } from './proxy.js';

function parseArgsList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadConfigFile(path: string): Partial<McpProxyConfig> {
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const args = raw.upstreamArgs ?? raw.upstream_args;
  return {
    upstreamCommand: (raw.upstreamCommand ?? raw.upstream_command) as string | undefined,
    upstreamArgs: Array.isArray(args) ? (args as string[]) : undefined,
    serverName: (raw.serverName ?? raw.server_name) as string | undefined,
    agent: raw.agent as string | undefined,
    cwd: raw.cwd as string | undefined,
  };
}

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('agent-passport-mcp')
    .description('MCP stdio proxy with Agent Passport policy enforcement')
    .version('0.2.0')
    .option('--upstream-command <cmd>', 'Upstream MCP server command (e.g. npx)')
    .option(
      '--upstream-args <args>',
      'Comma-separated upstream args (e.g. "-y,@modelcontextprotocol/server-filesystem,.")'
    )
    .option('--agent <id>', 'Agent / shell id (default: AGENT_PASSPORT_AGENT or coder)')
    .option('--cwd <path>', 'Project working directory')
    .option('--server-name <name>', 'MCP server name used in resource paths')
    .option('--config <path>', 'Path to mcp-proxy.json (default: <cwd>/.agent/mcp-proxy.json)')
    .parse(process.argv);

  const opts = program.opts<{
    upstreamCommand?: string;
    upstreamArgs?: string;
    agent?: string;
    cwd?: string;
    serverName?: string;
    config?: string;
  }>();

  const cwd = resolve(opts.cwd ?? process.cwd());
  const config = opts.config
    ? loadConfigFile(resolve(opts.config))
    : loadProxyConfig(cwd);

  const agent =
    opts.agent ?? config.agent ?? process.env.AGENT_PASSPORT_AGENT ?? 'coder';

  const upstreamCommand = opts.upstreamCommand ?? config.upstreamCommand;
  const upstreamArgs = opts.upstreamArgs
    ? parseArgsList(opts.upstreamArgs)
    : (config.upstreamArgs ?? []);

  if (!upstreamCommand) {
    console.error(
      'Error: --upstream-command is required (or set upstreamCommand in .agent/mcp-proxy.json)'
    );
    process.exit(1);
  }

  const proxyCwd = config.cwd ? resolve(cwd, config.cwd) : cwd;

  const proxy = new McpPassportProxy({
    upstreamCommand,
    upstreamArgs,
    serverName: opts.serverName ?? config.serverName ?? 'mcp',
    agentId: agent,
    shellId: agent,
    cwd: proxyCwd,
  });

  await proxy.start();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
