import type { ToolOutcome, ToolRequest, PolicyDecision } from '@agent-passport/core';

export interface McpToolCall {
  server: string;
  tool: string;
  arguments?: Record<string, unknown>;
}

export class McpGatewayAdapter {
  private readonly handlers: Map<
    string,
    (call: McpToolCall, request: ToolRequest) => Promise<unknown>
  >;

  constructor() {
    this.handlers = new Map();
  }

  registerHandler(
    toolPattern: string,
    handler: (call: McpToolCall, request: ToolRequest) => Promise<unknown>
  ): void {
    this.handlers.set(toolPattern, handler);
  }

  parseResource(resource: string): McpToolCall {
    const [server, tool] = resource.split('/', 2);
    return { server: server ?? 'default', tool: tool ?? resource };
  }

  async execute(request: ToolRequest, decision: PolicyDecision): Promise<ToolOutcome> {
    if (request.action !== 'mcp.tool.call') {
      return { success: false, errorCode: 'NOT_MCP_ACTION' };
    }

    const call = this.parseResource(request.resource);
    if (request.parameters && typeof request.parameters === 'object') {
      call.arguments = request.parameters as Record<string, unknown>;
    }

    const handler = this.handlers.get(call.tool) ?? this.handlers.get('*');
    if (!handler) {
      return {
        success: false,
        errorCode: 'MCP_TOOL_NOT_REGISTERED',
        resultRef: `blocked:${call.server}/${call.tool}`,
      };
    }

    try {
      const result = await handler(call, request);
      return {
        success: true,
        resultRef: `mcp:${call.server}/${call.tool}:${JSON.stringify(result).slice(0, 100)}`,
      };
    } catch (err) {
      return {
        success: false,
        errorCode: err instanceof Error ? err.message : 'MCP_EXECUTION_FAILED',
      };
    }
  }

  async intercept(
    request: ToolRequest,
    decision: PolicyDecision,
    forward?: (call: McpToolCall) => Promise<unknown>
  ): Promise<ToolOutcome> {
    if (decision.effect === 'deny' || decision.effect === 'approval_required') {
      return {
        success: false,
        errorCode: decision.effect === 'deny' ? 'POLICY_DENIED' : 'APPROVAL_REQUIRED',
        resultRef: decision.reason,
      };
    }

    const call = this.parseResource(request.resource);
    if (forward) {
      try {
        await forward(call);
        return { success: true, resultRef: `mcp:forwarded:${call.server}/${call.tool}` };
      } catch (err) {
        return {
          success: false,
          errorCode: err instanceof Error ? err.message : 'MCP_FORWARD_FAILED',
        };
      }
    }
    return this.execute(request, decision);
  }
}

export function createMcpExecutor(adapter?: McpGatewayAdapter) {
  const gw = adapter ?? new McpGatewayAdapter();
  return (req: ToolRequest, dec: PolicyDecision) => gw.execute(req, dec);
}
