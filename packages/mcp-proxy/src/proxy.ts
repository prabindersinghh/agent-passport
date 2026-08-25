import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import {
  PassportGateway,
  createGateway,
  canExecute,
  requiresApproval,
  type PolicyDecision,
  type AuthorizeInput,
} from '@agent-passport/core';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | (JsonRpcRequest & JsonRpcResponse);

export interface McpProxyConfig {
  upstreamCommand: string;
  upstreamArgs: string[];
  serverName?: string;
  agent?: string;
  cwd?: string;
}

export interface McpProxyOptions {
  upstreamCommand: string;
  upstreamArgs?: string[];
  serverName?: string;
  agentId?: string;
  shellId?: string;
  cwd?: string;
  /** Injected for tests; defaults to createGateway({ cwd }). */
  gateway?: PassportGateway;
  /** Override authorize (tests). Defaults to gateway.authorize. */
  authorize?: (input: AuthorizeInput) => PolicyDecision;
  /** Override upstream forward (tests). */
  forward?: (request: JsonRpcRequest) => Promise<JsonRpcResponse>;
}

const MCP_POLICY_DENIED = -32001;
const MCP_APPROVAL_REQUIRED = -32002;
const MCP_POLICY_ERROR = -32003;

const CONFIG_RELATIVE = join('.agent', 'mcp-proxy.json');

export function loadProxyConfig(cwd: string = process.cwd()): Partial<McpProxyConfig> {
  const path = resolve(cwd, CONFIG_RELATIVE);
  if (!existsSync(path)) {
    return {};
  }
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

function encodeFramed(message: object): Buffer {
  const json = JSON.stringify(message);
  const body = Buffer.from(json, 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
  return Buffer.concat([header, body]);
}

/** Incremental Content-Length frame parser (MCP / LSP style). */
export class FrameReader {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): object[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: object[] = [];

    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        break;
      }

      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        // Skip malformed header bytes and keep searching
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) {
        break;
      }

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.subarray(bodyEnd);
      messages.push(JSON.parse(body) as object);
    }

    return messages;
  }
}

export class McpPassportProxy {
  readonly cwd: string;
  readonly agentId: string;
  readonly shellId: string;
  readonly serverName: string;
  readonly upstreamCommand: string;
  readonly upstreamArgs: string[];

  private readonly gateway: PassportGateway;
  private readonly authorizeFn: (input: AuthorizeInput) => PolicyDecision;
  private readonly forwardOverride?: (request: JsonRpcRequest) => Promise<JsonRpcResponse>;

  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<
    string | number,
    {
      resolve: (value: JsonRpcResponse) => void;
      reject: (err: Error) => void;
      toolName?: string;
      traceId?: string;
      runId?: string;
      startedAt?: number;
    }
  >();
  private readonly upstreamReader = new FrameReader();
  private closed = false;

  constructor(options: McpProxyOptions) {
    this.cwd = resolve(options.cwd ?? process.cwd());
    const agent =
      options.agentId ??
      process.env.AGENT_PASSPORT_AGENT ??
      'coder';
    this.agentId = agent;
    this.shellId = options.shellId ?? agent;
    this.serverName = options.serverName ?? 'mcp';
    this.upstreamCommand = options.upstreamCommand;
    this.upstreamArgs = options.upstreamArgs ?? [];
    this.gateway = options.gateway ?? createGateway({ cwd: this.cwd });
    this.authorizeFn = options.authorize ?? ((input) => this.gateway.authorize(input));
    this.forwardOverride = options.forward;
  }

  /**
   * Authorize a tools/call. Fail closed if the policy engine throws.
   */
  authorizeToolCall(toolName: string, parameters?: unknown, ids?: {
    traceId?: string;
    runId?: string;
  }): PolicyDecision {
    const input: AuthorizeInput = {
      agentId: this.agentId,
      shellId: this.shellId,
      action: 'mcp.tool.call',
      resource: `${this.serverName}/${toolName}`,
      parameters,
      traceId: ids?.traceId ?? uuidv4(),
      runId: ids?.runId,
    };
    return this.authorizeFn(input);
  }

  policyErrorResponse(
    id: string | number | null | undefined,
    decision: PolicyDecision
  ): JsonRpcResponse {
    const reqId = id ?? null;
    if (requiresApproval(decision) || decision.effect === 'approval_required') {
      return {
        jsonrpc: '2.0',
        id: reqId,
        error: {
          code: MCP_APPROVAL_REQUIRED,
          message: `Approval required: ${decision.reason}`,
          data: {
            effect: decision.effect,
            reason: decision.reason,
            ruleIds: decision.ruleIds,
          },
        },
      };
    }
    return {
      jsonrpc: '2.0',
      id: reqId,
      error: {
        code: MCP_POLICY_DENIED,
        message: `Policy denied: ${decision.reason}`,
        data: {
          effect: decision.effect,
          reason: decision.reason,
          ruleIds: decision.ruleIds,
        },
      },
    };
  }

  failClosedResponse(
    id: string | number | null | undefined,
    err: unknown
  ): JsonRpcResponse {
    const message = err instanceof Error ? err.message : 'Policy evaluation failed';
    return {
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code: MCP_POLICY_ERROR,
        message: `Policy engine error (fail closed): ${message}`,
      },
    };
  }

  /**
   * Intercept tools/call. Returns an error response if blocked; null if allowed to forward.
   */
  interceptToolsCall(request: JsonRpcRequest): JsonRpcResponse | null {
    if (request.method !== 'tools/call') {
      return null;
    }

    const params = (request.params ?? {}) as { name?: string; arguments?: unknown };
    const toolName = params.name ?? 'unknown';

    let decision: PolicyDecision;
    try {
      decision = this.authorizeToolCall(toolName, params.arguments);
    } catch (err) {
      return this.failClosedResponse(request.id, err);
    }

    if (canExecute(decision)) {
      return null;
    }

    // deny, approval_required, expired — do not forward
    return this.policyErrorResponse(request.id, decision);
  }

  /**
   * Handle a client JSON-RPC message: enforce policy on tools/call, else forward.
   * Used by unit tests and the live stdio loop.
   */
  async handleClientRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | void> {
    if (request.method === 'tools/call') {
      const blocked = this.interceptToolsCall(request);
      if (blocked) {
        return blocked;
      }

      const params = (request.params ?? {}) as { name?: string; arguments?: unknown };
      const toolName = params.name ?? 'unknown';
      const traceId = uuidv4();
      const runId = `mcp_${Date.now().toString(36)}`;
      const projectId = this.safeProjectId();

      this.gateway.audit.emit('tool.started', {
        run_id: runId,
        agent_id: this.agentId,
        shell_id: this.shellId,
        project_id: projectId,
        action: 'mcp.tool.call',
        resource: `${this.serverName}/${toolName}`,
        trace_id: traceId,
      });

      const startedAt = Date.now();
      try {
        const response = await this.forwardToUpstream(request, {
          toolName,
          traceId,
          runId,
          startedAt,
        });

        const success = !response.error;
        if (success) {
          this.gateway.audit.emit('tool.completed', {
            run_id: runId,
            agent_id: this.agentId,
            shell_id: this.shellId,
            project_id: projectId,
            action: 'mcp.tool.call',
            resource: `${this.serverName}/${toolName}`,
            outcome: 'success',
            trace_id: traceId,
            metadata: { durationMs: Date.now() - startedAt },
          });
        } else {
          this.gateway.audit.emit('tool.failed', {
            run_id: runId,
            agent_id: this.agentId,
            shell_id: this.shellId,
            project_id: projectId,
            action: 'mcp.tool.call',
            resource: `${this.serverName}/${toolName}`,
            outcome: 'failed',
            trace_id: traceId,
            metadata: {
              errorCode: response.error?.message ?? 'UPSTREAM_ERROR',
              durationMs: Date.now() - startedAt,
            },
          });
        }

        return response;
      } catch (err) {
        this.gateway.audit.emit('tool.failed', {
          run_id: runId,
          agent_id: this.agentId,
          shell_id: this.shellId,
          project_id: projectId,
          action: 'mcp.tool.call',
          resource: `${this.serverName}/${toolName}`,
          outcome: 'failed',
          trace_id: traceId,
          metadata: {
            errorCode: err instanceof Error ? err.message : 'FORWARD_FAILED',
            durationMs: Date.now() - startedAt,
          },
        });
        return {
          jsonrpc: '2.0',
          id: request.id ?? null,
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : 'Upstream forward failed',
          },
        };
      }
    }

    // Non-tools/call: forward transparently (notifications have no response)
    if (request.id === undefined || request.id === null) {
      await this.writeUpstream(request);
      return;
    }

    return this.forwardToUpstream(request);
  }

  private safeProjectId(): string {
    try {
      const ctx = this.gateway.loadContext(this.agentId);
      return ctx.projectId;
    } catch {
      return 'unknown';
    }
  }

  private forwardToUpstream(
    request: JsonRpcRequest,
    meta?: { toolName?: string; traceId?: string; runId?: string; startedAt?: number }
  ): Promise<JsonRpcResponse> {
    if (this.forwardOverride) {
      return this.forwardOverride(request);
    }

    if (request.id === undefined || request.id === null) {
      return Promise.reject(new Error('Cannot wait for response without request id'));
    }

    const id = request.id;
    return new Promise<JsonRpcResponse>((resolvePromise, reject) => {
      this.pending.set(id, {
        resolve: resolvePromise,
        reject,
        toolName: meta?.toolName,
        traceId: meta?.traceId,
        runId: meta?.runId,
        startedAt: meta?.startedAt,
      });
      try {
        this.writeUpstream(request);
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private writeUpstream(message: object): void {
    if (this.forwardOverride) {
      // Test / dry path: notifications with no id — drop silently
      return;
    }
    if (!this.child?.stdin.writable) {
      throw new Error('Upstream MCP process is not running');
    }
    this.child.stdin.write(encodeFramed(message));
  }

  private writeClient(message: object): void {
    process.stdout.write(encodeFramed(message));
  }

  private onUpstreamMessage(raw: object): void {
    const msg = raw as JsonRpcMessage;
    if ('id' in msg && msg.id !== undefined && msg.id !== null && this.pending.has(msg.id)) {
      const pending = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      pending.resolve(msg as JsonRpcResponse);
      return;
    }
    // Notifications / unmatched responses: pass through to client
    this.writeClient(msg);
  }

  /**
   * Spawn upstream MCP server and bridge stdio with policy enforcement.
   */
  async start(): Promise<void> {
    if (!this.upstreamCommand) {
      throw new Error(
        'Missing upstream command. Set --upstream-command or .agent/mcp-proxy.json'
      );
    }

    const isWin = process.platform === 'win32';
    this.child = spawn(this.upstreamCommand, this.upstreamArgs, {
      cwd: this.cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isWin,
      windowsHide: true,
    }) as ChildProcessWithoutNullStreams;

    this.child.stdout.on('data', (chunk: Buffer) => {
      for (const msg of this.upstreamReader.push(chunk)) {
        this.onUpstreamMessage(msg);
      }
    });

    this.child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    this.child.on('error', (err) => {
      for (const [, p] of this.pending) {
        p.reject(err);
      }
      this.pending.clear();
    });

    this.child.on('exit', (code, signal) => {
      this.closed = true;
      const err = new Error(
        `Upstream MCP exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
      );
      for (const [, p] of this.pending) {
        p.reject(err);
      }
      this.pending.clear();
      if (code && code !== 0) {
        process.exitCode = code;
      }
    });

    // Client → proxy: Content-Length frames or NDJSON lines
    const stdinReader = new FrameReader();
    let lineBuf = '';
    let framedMode: boolean | null = null;

    process.stdin.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (framedMode === null) {
        framedMode = /Content-Length:/i.test(text);
      }

      if (framedMode) {
        for (const msg of stdinReader.push(chunk)) {
          void this.dispatchClientMessage(msg);
        }
        return;
      }

      lineBuf += text;
      const parts = lineBuf.split(/\r?\n/);
      lineBuf = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          void this.dispatchClientMessage(JSON.parse(trimmed) as object);
        } catch {
          /* ignore malformed line */
        }
      }
    });

    process.stdin.on('end', () => {
      this.stop();
    });

    process.on('SIGINT', () => {
      this.stop();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.stop();
      process.exit(0);
    });
  }

  private async dispatchClientMessage(raw: object): Promise<void> {
    const msg = raw as JsonRpcMessage;
    if (!('method' in msg) || typeof (msg as JsonRpcRequest).method !== 'string') {
      this.writeUpstream(msg);
      return;
    }

    const request = msg as JsonRpcRequest;
    const result = await this.handleClientRequest(request);
    if (result) {
      this.writeClient(result);
    }
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.child?.stdin.end();
    } catch {
      /* ignore */
    }
    this.child?.kill();
    this.gateway.close();
  }
}
