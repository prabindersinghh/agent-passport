import { z } from 'zod';

export const PolicyEffectSchema = z.enum([
  'allow',
  'deny',
  'approval',
  'approval_required',
]);

export type PolicyEffect = z.infer<typeof PolicyEffectSchema>;

export const DecisionEffectSchema = z.enum([
  'allow',
  'deny',
  'approval_required',
  'approved',
  'expired',
]);

export type DecisionEffect = z.infer<typeof DecisionEffectSchema>;

export const AgentRoleSchema = z.enum([
  'researcher',
  'coder',
  'reviewer',
  'deployer',
  'custom',
]);

export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const IdentitySchema = z.object({
  owner: z.string(),
  role: AgentRoleSchema,
  name: z.string().optional(),
  description: z.string().optional(),
});

export const PassportMetadataSchema = z.object({
  id: z.string(),
  project: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const PassportPermissionsSchema = z
  .object({
    filesystem: z
      .object({
        allow: z.array(z.string()).optional(),
        deny: z.array(z.string()).optional(),
      })
      .optional(),
    github: z
      .object({
        read: z.union([z.boolean(), z.literal('approval')]).optional(),
        create_pr: z.union([z.boolean(), z.literal('approval')]).optional(),
        merge_pr: z.union([z.boolean(), z.literal('approval')]).optional(),
      })
      .optional(),
    production: z
      .object({
        read: z.union([z.boolean(), z.literal('approval')]).optional(),
        deploy: z.union([z.boolean(), z.literal('approval')]).optional(),
      })
      .optional(),
    tests: z
      .object({
        run: z.union([z.boolean(), z.literal('approval')]).optional(),
      })
      .optional(),
    repository: z
      .object({
        read: z.union([z.boolean(), z.literal('approval')]).optional(),
      })
      .optional(),
    search: z
      .object({
        execute: z.union([z.boolean(), z.literal('approval')]).optional(),
      })
      .optional(),
    mcp: z
      .object({
        allow: z.array(z.string()).optional(),
        deny: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .passthrough();

export const AgentPassportSchema = z.object({
  apiVersion: z.literal('agentpassport.dev/v1'),
  kind: z.literal('AgentPassport'),
  metadata: PassportMetadataSchema,
  identity: IdentitySchema,
  capabilities: z.array(z.string()).default([]),
  policyRef: z.string().optional(),
  permissions: PassportPermissionsSchema.optional(),
  runtime: z.record(z.unknown()).optional(),
});

export type AgentPassport = z.infer<typeof AgentPassportSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string().optional(),
  effect: PolicyEffectSchema,
  action: z.string(),
  resource: z.string().default('*'),
  conditions: z.record(z.unknown()).optional(),
  priority: z.number().optional(),
  source: z.string().optional(),
  reason: z.string().optional(),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const ProjectPolicySchema = z.object({
  apiVersion: z.literal('agentpassport.dev/v1'),
  kind: z.literal('ProjectPolicy'),
  metadata: z.object({
    id: z.string(),
    version: z.union([z.string(), z.number()]).default('1'),
    name: z.string().optional(),
    activated: z.boolean().default(false),
    activatedAt: z.string().optional(),
  }),
  organization: z
    .object({
      id: z.string().optional(),
      rules: z.array(PolicyRuleSchema).default([]),
    })
    .optional(),
  rules: z.array(PolicyRuleSchema).default([]),
  require_approval: z.array(z.string()).optional(),
  defaultDeny: z.array(z.string()).optional(),
});

export type ProjectPolicy = z.infer<typeof ProjectPolicySchema>;

export const ProjectConfigSchema = z.object({
  apiVersion: z.literal('agentpassport.dev/v1'),
  kind: z.literal('Project'),
  metadata: z.object({
    id: z.string(),
    name: z.string().optional(),
    repository: z.string().optional(),
    policy_version: z.union([z.string(), z.number()]).default('1'),
    discoveredAt: z.string().optional(),
  }),
  discovery: z
    .object({
      signals: z.array(z.string()).default([]),
      language: z.string().optional(),
      packageManager: z.string().optional(),
    })
    .optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const ToolRequestSchema = z.object({
  agentId: z.string(),
  projectId: z.string(),
  shellId: z.string(),
  action: z.string(),
  resource: z.string(),
  parameters: z.unknown().optional(),
  traceId: z.string(),
  runId: z.string().optional(),
});

export type ToolRequest = z.infer<typeof ToolRequestSchema>;

export const PolicyDecisionSchema = z.object({
  effect: DecisionEffectSchema,
  reason: z.string(),
  ruleIds: z.array(z.string()),
  approvalRequestId: z.string().optional(),
  policySource: z.string().optional(),
  agentId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
});

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const ToolOutcomeSchema = z.object({
  success: z.boolean(),
  resultRef: z.string().optional(),
  errorCode: z.string().optional(),
  durationMs: z.number().optional(),
});

export type ToolOutcome = z.infer<typeof ToolOutcomeSchema>;

export const ApprovalScopeSchema = z.enum([
  'once',
  'session',
  'project',
  'permanent',
]);

export type ApprovalScope = z.infer<typeof ApprovalScopeSchema>;

export const ApprovalRequestSchema = z.object({
  request_id: z.string(),
  agent_id: z.string(),
  shell_id: z.string(),
  action: z.string(),
  resource: z.string(),
  reason: z.string(),
  requested_scope: ApprovalScopeSchema,
  status: z.enum(['pending', 'granted', 'denied', 'expired']).default('pending'),
  created_at: z.string(),
  expires_at: z.string().optional(),
  decided_at: z.string().optional(),
  decided_by: z.string().optional(),
  run_id: z.string().optional(),
  trace_id: z.string().optional(),
});

export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const AuditEventTypeSchema = z.enum([
  'agent.started',
  'agent.completed',
  'agent.role_switch',
  'agent.action.requested',
  'policy.evaluated',
  'action.allowed',
  'action.denied',
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'artifact.change',
  'security.violation',
  'summary.generated',
]);

export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

export const AuditEventSchema = z.object({
  id: z.string(),
  type: AuditEventTypeSchema,
  timestamp: z.string(),
  run_id: z.string().optional(),
  agent_id: z.string().optional(),
  shell_id: z.string().optional(),
  project_id: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  decision: z.string().optional(),
  outcome: z.string().optional(),
  trace_id: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const RunSummarySchema = z.object({
  run_id: z.string(),
  project_id: z.string(),
  duration_ms: z.number(),
  trace_id: z.string(),
  shells: z.array(
    z.object({
      shell_id: z.string(),
      actions_attempted: z.number(),
      allowed: z.number(),
      denied: z.number(),
      approval_required: z.number(),
      approvals_granted: z.number(),
      files_read: z.number().optional(),
      files_changed: z.number().optional(),
      tests_run: z.number().optional(),
      tests_passed: z.number().optional(),
      tests_failed: z.number().optional(),
      prs_created: z.number().optional(),
      merges: z.number().optional(),
      deployments: z.number().optional(),
      blocked_actions: z.array(z.string()).optional(),
    })
  ),
  totals: z.object({
    actions_attempted: z.number(),
    allowed: z.number(),
    denied: z.number(),
    approval_required: z.number(),
    approvals_granted: z.number(),
    approvals_denied: z.number(),
    files_read: z.number(),
    files_changed: z.number(),
    tests_run: z.number(),
    tests_passed: z.number(),
    tests_failed: z.number(),
    prs_created: z.number(),
    merges: z.number(),
    deployments: z.number(),
    blocked_high_risk_actions: z.array(z.string()),
  }),
  final_outcome: z.string(),
  files_changed: z.array(z.string()).optional(),
});

export type RunSummary = z.infer<typeof RunSummarySchema>;

export const ACTION_CATALOG = [
  'filesystem.read',
  'filesystem.write',
  'repository.read',
  'search.execute',
  'tests.run',
  'github.read',
  'github.create_pr',
  'github.merge_pr',
  'production.read',
  'production.deploy',
  'deployment.request',
  'deployment.execute',
  'mcp.tool.call',
  'review.comment',
  'review.approve',
] as const;

export type ActionName = (typeof ACTION_CATALOG)[number];

export const HIGH_RISK_ACTIONS = new Set<string>([
  'production.deploy',
  'deployment.execute',
  'github.merge_pr',
  'filesystem.write',
]);

export const DEFAULT_DENIED_ACTIONS = new Set<string>([
  'production.deploy',
  'deployment.execute',
]);
