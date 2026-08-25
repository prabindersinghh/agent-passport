import { minimatch } from 'minimatch';
import {
  AgentPassport,
  ApprovalRequest,
  DecisionEffect,
  PolicyDecision,
  PolicyRule,
  ProjectPolicy,
  ToolRequest,
  DEFAULT_DENIED_ACTIONS,
} from './types.js';

export interface EvaluationContext {
  passport: AgentPassport;
  projectPolicy: ProjectPolicy;
  sessionConstraints?: PolicyRule[];
  approvals?: ApprovalRequest[];
  now?: Date;
}

export interface MatchedRule {
  rule: PolicyRule;
  source: string;
  priority: number;
}

const EFFECT_PRIORITY: Record<string, number> = {
  deny: 300,
  approval: 200,
  approval_required: 200,
  allow: 100,
};

function normalizeEffect(effect: string): 'allow' | 'deny' | 'approval' {
  if (effect === 'approval_required') return 'approval';
  if (effect === 'allow' || effect === 'deny' || effect === 'approval') return effect;
  return 'deny';
}

function resourceMatches(pattern: string, resource: string): boolean {
  if (pattern === '*' || pattern === '**') return true;
  return minimatch(resource, pattern, { dot: true, nocase: true });
}

function actionMatches(ruleAction: string, requestAction: string): boolean {
  if (ruleAction === '*' || ruleAction === requestAction) return true;
  if (requestAction.startsWith(ruleAction + '.')) return true;
  if (ruleAction.endsWith('.*')) {
    const prefix = ruleAction.slice(0, -2);
    return requestAction === prefix || requestAction.startsWith(prefix + '.');
  }
  return false;
}

function passportRules(passport: AgentPassport): PolicyRule[] {
  const rules: PolicyRule[] = [];
  const perms = passport.permissions;
  if (!perms) return rules;

  if (perms.filesystem) {
    for (const path of perms.filesystem.allow ?? []) {
      rules.push({
        effect: 'allow',
        action: 'filesystem.read',
        resource: path,
        source: 'passport',
        id: `passport:fs:read:${path}`,
        priority: 100,
      });
      rules.push({
        effect: 'allow',
        action: 'filesystem.write',
        resource: path,
        source: 'passport',
        id: `passport:fs:write:${path}`,
        priority: 100,
      });
    }
    for (const path of perms.filesystem.deny ?? []) {
      rules.push({
        effect: 'deny',
        action: 'filesystem.*',
        resource: path,
        source: 'passport',
        id: `passport:fs:deny:${path}`,
        priority: 900,
      });
    }
  }

  if (perms.github) {
    const gh = perms.github;
    if (gh.read !== undefined) {
      rules.push(makeBoolRule('github.read', '*', gh.read, 'passport'));
    }
    if (gh.create_pr !== undefined) {
      rules.push(makeBoolRule('github.create_pr', '*', gh.create_pr, 'passport'));
    }
    if (gh.merge_pr !== undefined) {
      rules.push(makeBoolRule('github.merge_pr', '*', gh.merge_pr, 'passport'));
    }
  }

  if (perms.production) {
    const prod = perms.production;
    if (prod.read !== undefined) {
      rules.push(makeBoolRule('production.read', '*', prod.read, 'passport'));
    }
    if (prod.deploy !== undefined) {
      rules.push(makeBoolRule('production.deploy', '*', prod.deploy, 'passport'));
    }
  }

  if (perms.tests?.run !== undefined) {
    rules.push(makeBoolRule('tests.run', '*', perms.tests.run, 'passport'));
  }

  if (perms.repository?.read !== undefined) {
    rules.push(makeBoolRule('repository.read', '*', perms.repository.read, 'passport'));
  }

  if (perms.search?.execute !== undefined) {
    rules.push(makeBoolRule('search.execute', '*', perms.search.execute, 'passport'));
  }

  if (perms.mcp) {
    for (const tool of perms.mcp.allow ?? []) {
      rules.push({
        effect: 'allow',
        action: 'mcp.tool.call',
        resource: tool,
        source: 'passport',
        id: `passport:mcp:${tool}`,
        priority: 100,
      });
    }
    for (const tool of perms.mcp.deny ?? []) {
      rules.push({
        effect: 'deny',
        action: 'mcp.tool.call',
        resource: tool,
        source: 'passport',
        id: `passport:mcp:deny:${tool}`,
        priority: 900,
      });
    }
  }

  return rules;
}

function makeBoolRule(
  action: string,
  resource: string,
  value: boolean | 'approval',
  source: string
): PolicyRule {
  const effect = value === true ? 'allow' : value === false ? 'deny' : 'approval';
  return {
    effect,
    action,
    resource,
    source,
    id: `${source}:${action}`,
    priority: 100,
  };
}

function collectRules(ctx: EvaluationContext): MatchedRule[] {
  const matched: MatchedRule[] = [];

  for (const rule of ctx.projectPolicy.organization?.rules ?? []) {
    matched.push({
      rule: { ...rule, source: rule.source ?? 'organization' },
      source: 'organization',
      priority: rule.priority ?? 1000,
    });
  }

  for (const rule of ctx.projectPolicy.rules) {
    matched.push({
      rule: { ...rule, source: rule.source ?? 'project' },
      source: 'project',
      priority: rule.priority ?? 500,
    });
  }

  for (const rule of passportRules(ctx.passport)) {
    matched.push({
      rule,
      source: 'passport',
      priority: rule.priority ?? 300,
    });
  }

  for (const rule of ctx.sessionConstraints ?? []) {
    matched.push({
      rule: { ...rule, source: rule.source ?? 'session' },
      source: 'session',
      priority: rule.priority ?? 200,
    });
  }

  if (ctx.projectPolicy.defaultDeny) {
    for (const action of ctx.projectPolicy.defaultDeny) {
      matched.push({
        rule: {
          effect: 'deny',
          action,
          resource: '*',
          source: 'project-default',
          id: `default-deny:${action}`,
          priority: 400,
        },
        source: 'project-default',
        priority: 400,
      });
    }
  }

  return matched;
}

function findValidApproval(
  ctx: EvaluationContext,
  action: string,
  resource: string
): ApprovalRequest | undefined {
  const now = ctx.now ?? new Date();
  return (ctx.approvals ?? []).find((a) => {
    if (a.status !== 'granted') return false;
    if (a.agent_id !== ctx.passport.metadata.id) return false;
    if (!actionMatches(a.action, action)) return false;
    if (a.resource !== '*' && !resourceMatches(a.resource, resource)) return false;
    if (a.expires_at && new Date(a.expires_at) < now) return false;
    return true;
  });
}

export function evaluatePolicy(
  request: Pick<ToolRequest, 'action' | 'resource'>,
  ctx: EvaluationContext
): PolicyDecision {
  const { action, resource } = request;
  const allRules = collectRules(ctx);

  const applicable = allRules.filter(
    ({ rule }) => actionMatches(rule.action, action) && resourceMatches(rule.resource, resource)
  );

  if (applicable.length === 0) {
    if (DEFAULT_DENIED_ACTIONS.has(action)) {
      return {
        effect: 'deny',
        reason: `No explicit allow rule for high-risk action '${action}'`,
        ruleIds: ['default-deny'],
        policySource: 'default',
        action,
        resource,
        agentId: ctx.passport.metadata.id,
      };
    }
    return {
      effect: 'deny',
      reason: `No matching policy rule for action '${action}' on resource '${resource}'`,
      ruleIds: [],
      policySource: 'default',
      action,
      resource,
      agentId: ctx.passport.metadata.id,
    };
  }

  applicable.sort((a, b) => {
    const effectDiff =
      EFFECT_PRIORITY[normalizeEffect(b.rule.effect)] -
      EFFECT_PRIORITY[normalizeEffect(a.rule.effect)];
    if (effectDiff !== 0) return effectDiff;
    return b.priority - a.priority;
  });

  const topDeny = applicable.find((m) => normalizeEffect(m.rule.effect) === 'deny');
  if (topDeny) {
    return {
      effect: 'deny',
      reason: topDeny.rule.reason ?? `Denied by ${topDeny.source} policy`,
      ruleIds: [topDeny.rule.id ?? `${topDeny.source}:deny`],
      policySource: topDeny.source,
      action,
      resource,
      agentId: ctx.passport.metadata.id,
    };
  }

  const topApproval = applicable.find((m) => normalizeEffect(m.rule.effect) === 'approval');
  if (topApproval) {
    const approval = findValidApproval(ctx, action, resource);
    if (approval) {
      return {
        effect: 'approved',
        reason: `Valid approval ${approval.request_id} grants this action`,
        ruleIds: [topApproval.rule.id ?? `${topApproval.source}:approval`],
        approvalRequestId: approval.request_id,
        policySource: topApproval.source,
        action,
        resource,
        agentId: ctx.passport.metadata.id,
      };
    }
    return {
      effect: 'approval_required',
      reason: topApproval.rule.reason ?? `Human approval required for '${action}'`,
      ruleIds: [topApproval.rule.id ?? `${topApproval.source}:approval`],
      policySource: topApproval.source,
      action,
      resource,
      agentId: ctx.passport.metadata.id,
    };
  }

  const topAllow = applicable.find((m) => normalizeEffect(m.rule.effect) === 'allow');
  if (topAllow) {
    if (!ctx.passport.capabilities.some((c) => actionMatches(c, action))) {
      const capMatch = ctx.passport.capabilities.length === 0;
      if (!capMatch) {
        return {
          effect: 'deny',
          reason: `Action '${action}' not in agent capabilities`,
          ruleIds: ['capability-check'],
          policySource: 'passport',
          action,
          resource,
          agentId: ctx.passport.metadata.id,
        };
      }
    }
    return {
      effect: 'allow',
      reason: topAllow.rule.reason ?? `Allowed by ${topAllow.source} policy`,
      ruleIds: [topAllow.rule.id ?? `${topAllow.source}:allow`],
      policySource: topAllow.source,
      action,
      resource,
      agentId: ctx.passport.metadata.id,
    };
  }

  return {
    effect: 'deny',
    reason: 'Default deny — no applicable allow rule',
    ruleIds: ['default-deny'],
    policySource: 'default',
    action,
    resource,
    agentId: ctx.passport.metadata.id,
  };
}

export function canExecute(decision: PolicyDecision): boolean {
  return decision.effect === 'allow' || decision.effect === 'approved';
}

export function requiresApproval(decision: PolicyDecision): boolean {
  return decision.effect === 'approval_required';
}

export function isDenied(decision: PolicyDecision): boolean {
  return decision.effect === 'deny' || decision.effect === 'expired';
}

export function decisionToAuditDecision(effect: DecisionEffect): string {
  switch (effect) {
    case 'allow':
    case 'approved':
      return 'allow';
    case 'deny':
    case 'expired':
      return 'deny';
    case 'approval_required':
      return 'approval_required';
    default:
      return String(effect);
  }
}
