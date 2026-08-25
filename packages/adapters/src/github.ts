import type { ToolOutcome, ToolRequest, PolicyDecision } from '@agent-passport/core';

export type GitHubMode = 'mock' | 'live';

export interface GitHubAdapterOptions {
  mode?: GitHubMode;
  /** Token name only in docs — value from env GITHUB_TOKEN */
  tokenEnv?: string;
  initialPr?: number;
  fetchImpl?: typeof fetch;
}

/**
 * GitHub adapter.
 * - mock: local simulation (default, safe for demos/CI)
 * - live: real GitHub REST API when GITHUB_TOKEN is set
 * Policy must ALLOW/APPROVE before any API call (gateway enforces).
 */
export class GitHubAdapter {
  private readonly mode: GitHubMode;
  private readonly tokenEnv: string;
  private readonly prCounter: { value: number };
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubAdapterOptions = {}) {
    const envMode = process.env.AGENT_PASSPORT_GITHUB_MODE as GitHubMode | undefined;
    this.mode = options.mode ?? envMode ?? 'mock';
    this.tokenEnv = options.tokenEnv ?? 'GITHUB_TOKEN';
    this.prCounter = { value: options.initialPr ?? 184 };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private getToken(): string | undefined {
    return process.env[this.tokenEnv];
  }

  async execute(request: ToolRequest, _decision: PolicyDecision): Promise<ToolOutcome> {
    if (this.mode === 'live') {
      return this.executeLive(request);
    }
    return this.executeMock(request);
  }

  private async executeMock(request: ToolRequest): Promise<ToolOutcome> {
    switch (request.action) {
      case 'github.read':
        return { success: true, resultRef: `github:mock:read:${request.resource}` };
      case 'github.create_pr': {
        const prNumber = this.prCounter.value++;
        return { success: true, resultRef: `github:mock:pr:${prNumber}` };
      }
      case 'github.merge_pr':
        return { success: true, resultRef: `github:mock:merged:${request.resource}` };
      case 'github.create_issue':
        return { success: true, resultRef: `github:mock:issue:${request.resource}` };
      default:
        return { success: false, errorCode: 'UNSUPPORTED_GITHUB_ACTION' };
    }
  }

  private async executeLive(request: ToolRequest): Promise<ToolOutcome> {
    const token = this.getToken();
    if (!token) {
      return {
        success: false,
        errorCode: 'GITHUB_TOKEN_MISSING',
        resultRef: `Set ${this.tokenEnv} for live mode (never commit tokens)`,
      };
    }

    const params = (request.parameters ?? {}) as Record<string, unknown>;
    const owner = String(params.owner ?? '');
    const repo = String(params.repo ?? '');
    if (!owner || !repo) {
      return {
        success: false,
        errorCode: 'GITHUB_OWNER_REPO_REQUIRED',
        resultRef: 'parameters.owner and parameters.repo required for live mode',
      };
    }

    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'agent-passport',
    };

    try {
      switch (request.action) {
        case 'github.read': {
          const res = await this.fetchImpl(`https://api.github.com/repos/${owner}/${repo}`, {
            headers,
          });
          if (!res.ok) return { success: false, errorCode: `GITHUB_HTTP_${res.status}` };
          return { success: true, resultRef: `github:live:read:${owner}/${repo}` };
        }
        case 'github.create_pr': {
          const res = await this.fetchImpl(
            `https://api.github.com/repos/${owner}/${repo}/pulls`,
            {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: params.title ?? 'Agent Passport PR',
                head: params.head,
                base: params.base ?? 'main',
                body: params.body ?? '',
              }),
            }
          );
          if (!res.ok) return { success: false, errorCode: `GITHUB_HTTP_${res.status}` };
          const data = (await res.json()) as { number?: number };
          return { success: true, resultRef: `github:live:pr:${data.number ?? '?'}` };
        }
        case 'github.merge_pr': {
          const pr = String(params.pull_number ?? request.resource.split('/').pop() ?? '');
          const res = await this.fetchImpl(
            `https://api.github.com/repos/${owner}/${repo}/pulls/${pr}/merge`,
            {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ merge_method: params.merge_method ?? 'squash' }),
            }
          );
          if (!res.ok) return { success: false, errorCode: `GITHUB_HTTP_${res.status}` };
          return { success: true, resultRef: `github:live:merged:${pr}` };
        }
        case 'github.create_issue': {
          const res = await this.fetchImpl(
            `https://api.github.com/repos/${owner}/${repo}/issues`,
            {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: params.title ?? 'Issue',
                body: params.body ?? '',
              }),
            }
          );
          if (!res.ok) return { success: false, errorCode: `GITHUB_HTTP_${res.status}` };
          const data = (await res.json()) as { number?: number };
          return { success: true, resultRef: `github:live:issue:${data.number ?? '?'}` };
        }
        default:
          return { success: false, errorCode: 'UNSUPPORTED_GITHUB_ACTION' };
      }
    } catch (err) {
      return {
        success: false,
        errorCode: err instanceof Error ? err.message : 'GITHUB_REQUEST_FAILED',
      };
    }
  }
}

export function createGitHubExecutor(options?: GitHubAdapterOptions | number) {
  const opts: GitHubAdapterOptions =
    typeof options === 'number' ? { initialPr: options } : options ?? {};
  const adapter = new GitHubAdapter(opts);
  return (req: ToolRequest, dec: PolicyDecision) => adapter.execute(req, dec);
}
