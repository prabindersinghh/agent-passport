import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ToolOutcome, ToolRequest, PolicyDecision } from '@agent-passport/core';

export interface FilesystemAdapterOptions {
  cwd?: string;
  dryRun?: boolean;
}

export class FilesystemAdapter {
  private readonly cwd: string;
  private readonly dryRun: boolean;

  constructor(options: FilesystemAdapterOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.dryRun = options.dryRun ?? false;
  }

  async read(request: ToolRequest, _decision: PolicyDecision): Promise<ToolOutcome> {
    const fullPath = resolve(this.cwd, request.resource);
    if (!existsSync(fullPath)) {
      return { success: false, errorCode: 'ENOENT' };
    }
    const content = readFileSync(fullPath, 'utf8');
    return { success: true, resultRef: `read:${request.resource}:${content.length}bytes` };
  }

  async write(request: ToolRequest, decision: PolicyDecision): Promise<ToolOutcome> {
    const fullPath = resolve(this.cwd, request.resource);
    const content =
      typeof request.parameters === 'object' &&
      request.parameters !== null &&
      'content' in request.parameters
        ? String((request.parameters as { content: unknown }).content)
        : '';

    if (this.dryRun) {
      return { success: true, resultRef: `dry-run:write:${request.resource}` };
    }

    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf8');
    return { success: true, resultRef: `write:${request.resource}:${decision.ruleIds.join(',')}` };
  }

  async execute(request: ToolRequest, decision: PolicyDecision): Promise<ToolOutcome> {
    switch (request.action) {
      case 'filesystem.read':
        return this.read(request, decision);
      case 'filesystem.write':
        return this.write(request, decision);
      default:
        return { success: false, errorCode: 'UNSUPPORTED_ACTION' };
    }
  }
}

export function createFilesystemExecutor(
  options?: FilesystemAdapterOptions
): (request: ToolRequest, decision: PolicyDecision) => Promise<ToolOutcome> {
  const adapter = new FilesystemAdapter(options);
  return (req, dec) => adapter.execute(req, dec);
}
