import { describe, it, expect } from 'vitest';
import { McpGatewayAdapter } from '../src/mcp.js';
import type { ToolRequest, PolicyDecision } from '@agent-passport/core';

describe('MCP Gateway', () => {
  it('blocks denied policy before forwarding', async () => {
    const gw = new McpGatewayAdapter();
    const decision: PolicyDecision = {
      effect: 'deny',
      reason: 'test deny',
      ruleIds: ['test'],
    };
    const request: ToolRequest = {
      agentId: 'coder',
      projectId: 'test',
      shellId: 'coder',
      action: 'mcp.tool.call',
      resource: 'server/dangerous_tool',
      traceId: 'trace-1',
    };
    const result = await gw.intercept(request, decision);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('POLICY_DENIED');
  });

  it('blocks approval_required before forwarding', async () => {
    const gw = new McpGatewayAdapter();
    const result = await gw.intercept(
      {
        agentId: 'coder',
        projectId: 'test',
        shellId: 'coder',
        action: 'mcp.tool.call',
        resource: 'server/tool',
        traceId: 't1',
      },
      { effect: 'approval_required', reason: 'needs approval', ruleIds: [] }
    );
    expect(result.errorCode).toBe('APPROVAL_REQUIRED');
  });
});
