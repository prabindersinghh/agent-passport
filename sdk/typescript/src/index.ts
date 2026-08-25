import {
  createGateway,
  loadPassport,
  agentPassportPath,
  PolicyDecision,
  PassportGateway,
} from '@agent-passport/core';

export interface AuthorizeOptions {
  action: string;
  resource: string;
  agentId?: string;
  shellId?: string;
  traceId?: string;
  runId?: string;
}

export class Passport {
  readonly agentId: string;
  readonly gateway: PassportGateway;
  private readonly cwd: string;

  constructor(agentId: string, cwd?: string) {
    this.agentId = agentId;
    this.cwd = cwd ?? process.cwd();
    this.gateway = createGateway({ cwd: this.cwd });
    loadPassport(agentPassportPath(agentId, this.cwd));
  }

  static load(pathOrAgentId: string, cwd?: string): Passport {
    const agentId = pathOrAgentId.includes('/') || pathOrAgentId.includes('\\')
      ? loadPassport(pathOrAgentId).metadata.id
      : pathOrAgentId;
    return new Passport(agentId, cwd);
  }

  authorize(options: AuthorizeOptions): PolicyDecision {
    return this.gateway.authorize({
      agentId: options.agentId ?? this.agentId,
      shellId: options.shellId ?? this.agentId,
      action: options.action,
      resource: options.resource,
      traceId: options.traceId,
      runId: options.runId,
    });
  }

  async authorizeAndExecute<T>(
    options: AuthorizeOptions,
    executor: Parameters<PassportGateway['execute']>[1]
  ) {
    return this.gateway.execute(
      {
        agentId: options.agentId ?? this.agentId,
        shellId: options.shellId ?? this.agentId,
        action: options.action,
        resource: options.resource,
        traceId: options.traceId,
        runId: options.runId,
        parameters: (options as AuthorizeOptions & { parameters?: unknown }).parameters,
      },
      executor
    );
  }

  close(): void {
    this.gateway.close();
  }
}

export * from '@agent-passport/core';
