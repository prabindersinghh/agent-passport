import type { ToolOutcome, ToolRequest, PolicyDecision } from '@agent-passport/core';

export interface GitHubOperationResult {
  prNumber?: number;
  merged?: boolean;
  url?: string;
}

export class GitHubAdapter {
  private readonly prCounter: { value: number };

  constructor(initialPr = 184) {
    this.prCounter = { value: initialPr };
  }

  async execute(request: ToolRequest, _decision: PolicyDecision): Promise<ToolOutcome> {
    switch (request.action) {
      case 'github.read':
        return { success: true, resultRef: `github:read:${request.resource}` };
      case 'github.create_pr': {
        const prNumber = this.prCounter.value++;
        return {
          success: true,
          resultRef: `github:pr:${prNumber}`,
        };
      }
      case 'github.merge_pr':
        return {
          success: true,
          resultRef: `github:merged:${request.resource}`,
        };
      default:
        return { success: false, errorCode: 'UNSUPPORTED_GITHUB_ACTION' };
    }
  }
}

export function createGitHubExecutor(initialPr?: number) {
  const adapter = new GitHubAdapter(initialPr);
  return (req: ToolRequest, dec: PolicyDecision) => adapter.execute(req, dec);
}
