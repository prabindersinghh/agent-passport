import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ToolOutcome, ToolRequest, PolicyDecision } from '@agent-passport/core';
import {
  normalizeFsResource,
  resolveWithinWorkspace,
  isProtectedPath,
  ResourceSecurityError,
} from '@agent-passport/core';

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

  private resolveSafe(resource: string): { fullPath: string; normalized: string } {
    const normalized = normalizeFsResource(resource);
    if (isProtectedPath(normalized) && !normalized.includes('memory')) {
      // Allow reading under memory for agent memory stores; never write .agent/policy or passports
      if (
        normalized === './.agent' ||
        normalized.startsWith('./.agent/policy') ||
        normalized.startsWith('./.agent/project') ||
        normalized.includes('/passport.yaml') ||
        normalized.startsWith('./.env') ||
        normalized.startsWith('./.git')
      ) {
        throw new ResourceSecurityError(
          'PROTECTED_PATH',
          `Access to protected path is denied: ${resource}`
        );
      }
    }
    if (
      isProtectedPath(normalized) &&
      (normalized === './.agent' ||
        normalized.startsWith('./.agent/') ||
        normalized.startsWith('./.env') ||
        normalized.startsWith('./.git'))
    ) {
      // Block all writes to protected trees in write(); reads of non-policy .agent may still be denied by policy
      // Hard block for policy/secrets/.git always
      if (
        normalized.startsWith('./.env') ||
        normalized.startsWith('./.git') ||
        normalized.includes('policy.yaml') ||
        normalized.includes('project.yaml') ||
        normalized.includes('passport.yaml') ||
        normalized.includes('approvals.db') ||
        normalized.includes('audit.jsonl')
      ) {
        throw new ResourceSecurityError(
          'PROTECTED_PATH',
          `Access to protected path is denied: ${resource}`
        );
      }
    }
    const fullPath = resolveWithinWorkspace(this.cwd, normalized);
    return { fullPath, normalized };
  }

  async read(request: ToolRequest, _decision: PolicyDecision): Promise<ToolOutcome> {
    try {
      const { fullPath, normalized } = this.resolveSafe(request.resource);
      if (
        normalized.startsWith('./.env') ||
        normalized.includes('secrets/') ||
        normalized.includes('passport.yaml') ||
        normalized.includes('policy.yaml') ||
        normalized.includes('approvals.db')
      ) {
        return { success: false, errorCode: 'PROTECTED_PATH' };
      }
      if (!existsSync(fullPath)) {
        return { success: false, errorCode: 'ENOENT' };
      }
      const content = readFileSync(fullPath, 'utf8');
      return { success: true, resultRef: `read:${normalized}:${content.length}bytes` };
    } catch (err) {
      if (err instanceof ResourceSecurityError) {
        return { success: false, errorCode: err.code, resultRef: err.message };
      }
      throw err;
    }
  }

  async write(request: ToolRequest, decision: PolicyDecision): Promise<ToolOutcome> {
    try {
      const { fullPath, normalized } = this.resolveSafe(request.resource);
      if (isProtectedPath(normalized)) {
        return {
          success: false,
          errorCode: 'PROTECTED_PATH',
          resultRef: `Write to protected path denied: ${normalized}`,
        };
      }
      const content =
        typeof request.parameters === 'object' &&
        request.parameters !== null &&
        'content' in request.parameters
          ? String((request.parameters as { content: unknown }).content)
          : '';

      if (this.dryRun) {
        return { success: true, resultRef: `dry-run:write:${normalized}` };
      }

      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf8');
      return { success: true, resultRef: `write:${normalized}:${decision.ruleIds.join(',')}` };
    } catch (err) {
      if (err instanceof ResourceSecurityError) {
        return { success: false, errorCode: err.code, resultRef: err.message };
      }
      throw err;
    }
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
