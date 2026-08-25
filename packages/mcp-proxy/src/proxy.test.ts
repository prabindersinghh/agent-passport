import { describe, it, expect, vi } from 'vitest';
import {
  McpPassportProxy,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './proxy.js';
import type { PolicyDecision, AuthorizeInput } from '@agent-passport/core';

function denyDecision(reason = 'denied by test'): PolicyDecision {
  return { effect: 'deny', reason, ruleIds: ['test-deny'] };
}

function allowDecision(reason = 'allowed'): PolicyDecision {
  return { effect: 'allow', reason, ruleIds: ['test-allow'] };
}

function approvalDecision(reason = 'needs approval'): PolicyDecision {
  return { effect: 'approval_required', reason, ruleIds: ['test-approval'] };
}

function stubGateway(auditEmit = vi.fn()) {
  return {
    authorize: () => allowDecision(),
    audit: { emit: auditEmit },
    loadContext: () => ({
      projectId: 'proj',
      passport: {},
      projectPolicy: {},
    }),
    close: () => undefined,
  } as never;
}

function toolsCall(name: string, id: number | string = 1): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: { path: '/tmp' } },
  };
}

describe('McpPassportProxy policy intercept', () => {
  it('does not forward when authorize returns deny', async () => {
    const forward = vi.fn(async (): Promise<JsonRpcResponse> => ({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: 'should-not-run' }] },
    }));

    const authorize = vi.fn((_input: AuthorizeInput): PolicyDecision => denyDecision());

    const proxy = new McpPassportProxy({
      upstreamCommand: 'echo',
      authorize,
      forward,
      gateway: stubGateway(),
      serverName: 'filesystem',
      agentId: 'coder',
      cwd: process.cwd(),
    });

    const response = await proxy.handleClientRequest(toolsCall('write_file'));

    expect(forward).not.toHaveBeenCalled();
    expect(authorize).toHaveBeenCalledOnce();
    expect(authorize.mock.calls[0]![0]).toMatchObject({
      action: 'mcp.tool.call',
      resource: 'filesystem/write_file',
      agentId: 'coder',
      shellId: 'coder',
    });
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32001,
        message: expect.stringContaining('Policy denied'),
      },
    });
  });

  it('does not forward when authorize returns approval_required', async () => {
    const forward = vi.fn(async (): Promise<JsonRpcResponse> => ({
      jsonrpc: '2.0',
      id: 2,
      result: {},
    }));

    const proxy = new McpPassportProxy({
      upstreamCommand: 'echo',
      authorize: () => approvalDecision(),
      forward,
      gateway: stubGateway(),
      serverName: 'fs',
      agentId: 'coder',
    });

    const response = await proxy.handleClientRequest(toolsCall('delete', 2));

    expect(forward).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      id: 2,
      error: {
        code: -32002,
        message: expect.stringContaining('Approval required'),
      },
    });
  });

  it('forwards when authorize returns allow and returns upstream result', async () => {
    const upstreamResult = {
      content: [{ type: 'text', text: 'ok' }],
    };
    const forward = vi.fn(async (req: JsonRpcRequest): Promise<JsonRpcResponse> => ({
      jsonrpc: '2.0',
      id: req.id ?? null,
      result: upstreamResult,
    }));

    const auditEmit = vi.fn();
    const proxy = new McpPassportProxy({
      upstreamCommand: 'echo',
      authorize: () => allowDecision(),
      forward,
      serverName: 'filesystem',
      agentId: 'coder',
      gateway: stubGateway(auditEmit),
    });

    const response = await proxy.handleClientRequest(toolsCall('read_file', 3));

    expect(forward).toHaveBeenCalledOnce();
    expect(forward.mock.calls[0]![0].method).toBe('tools/call');
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: upstreamResult,
    });
    expect(auditEmit).toHaveBeenCalledWith(
      'tool.started',
      expect.objectContaining({
        action: 'mcp.tool.call',
        resource: 'filesystem/read_file',
      })
    );
    expect(auditEmit).toHaveBeenCalledWith(
      'tool.completed',
      expect.objectContaining({
        outcome: 'success',
        resource: 'filesystem/read_file',
      })
    );
  });

  it('fail-closes without forwarding when authorize throws', async () => {
    const forward = vi.fn(async (): Promise<JsonRpcResponse> => ({
      jsonrpc: '2.0',
      id: 4,
      result: {},
    }));

    const proxy = new McpPassportProxy({
      upstreamCommand: 'echo',
      authorize: () => {
        throw new Error('policy engine crashed');
      },
      forward,
      gateway: stubGateway(),
      serverName: 'mcp',
      agentId: 'coder',
    });

    const response = await proxy.handleClientRequest(toolsCall('anything', 4));

    expect(forward).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      id: 4,
      error: {
        code: -32003,
        message: expect.stringContaining('fail closed'),
      },
    });
  });

  it('interceptToolsCall returns null on allow (forward path)', () => {
    const proxy = new McpPassportProxy({
      upstreamCommand: 'echo',
      authorize: () => allowDecision(),
      gateway: stubGateway(),
      serverName: 's',
      agentId: 'coder',
    });
    expect(proxy.interceptToolsCall(toolsCall('t'))).toBeNull();
  });

  it('forwards non-tools/call requests without authorize', async () => {
    const authorize = vi.fn();
    const forward = vi.fn(async (req: JsonRpcRequest): Promise<JsonRpcResponse> => ({
      jsonrpc: '2.0',
      id: req.id ?? null,
      result: { tools: [] },
    }));

    const proxy = new McpPassportProxy({
      upstreamCommand: 'echo',
      authorize,
      forward,
      gateway: stubGateway(),
      serverName: 'mcp',
      agentId: 'coder',
    });

    const response = await proxy.handleClientRequest({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/list',
      params: {},
    });

    expect(authorize).not.toHaveBeenCalled();
    expect(forward).toHaveBeenCalledOnce();
    expect(response).toMatchObject({ id: 10, result: { tools: [] } });
  });
});
