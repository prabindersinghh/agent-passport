import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  createGateway,
  loadProjectConfig,
  summaryFromAuditStore,
  type PassportGateway,
  type PolicyDecision,
  type ApprovalScope,
} from '@agent-passport/core';

export interface HttpGatewayOptions {
  cwd?: string;
  gateway?: PassportGateway;
}

const AuthorizeBodySchema = z.object({
  agentId: z.string().min(1),
  shellId: z.string().min(1).optional(),
  action: z.string().min(1),
  resource: z.string().min(1),
  parameters: z.unknown().optional(),
  runId: z.string().optional(),
  traceId: z.string().optional(),
});

const CreateApprovalBodySchema = z.object({
  agentId: z.string().min(1),
  shellId: z.string().min(1),
  action: z.string().min(1),
  resource: z.string().min(1),
  reason: z.string().optional(),
  scope: z.enum(['once', 'session', 'project', 'permanent']).optional(),
});

const GrantBodySchema = z.object({
  decidedBy: z.string().min(1),
});

const DenyBodySchema = z.object({
  decidedBy: z.string().min(1).optional(),
});

export interface HttpPolicyDecision {
  decision: string;
  effect: PolicyDecision['effect'];
  reason: string;
  agent: string;
  ruleIds: string[];
  policySource?: string;
  approvalRequestId?: string;
  trace_id: string;
}

/** Strip values that look like secrets from error text before returning to clients. */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/\b(sk|pk|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function failClosedDecision(
  agentId: string,
  reason: string,
  traceId: string
): HttpPolicyDecision {
  return {
    decision: 'DENY',
    effect: 'deny',
    reason: sanitizeErrorMessage(reason),
    agent: agentId || 'unknown',
    ruleIds: ['fail-closed'],
    policySource: 'gateway',
    trace_id: traceId,
  };
}

function toHttpDecision(
  decision: PolicyDecision,
  agentId: string,
  traceId: string
): HttpPolicyDecision {
  return {
    decision: decision.effect.toUpperCase(),
    effect: decision.effect,
    reason: decision.reason,
    agent: agentId,
    ruleIds: decision.ruleIds,
    policySource: decision.policySource,
    ...(decision.approvalRequestId
      ? { approvalRequestId: decision.approvalRequestId }
      : {}),
    trace_id: traceId,
  };
}

export function resolveCwd(explicit?: string): string {
  return explicit ?? process.env.AGENT_PASSPORT_CWD ?? process.cwd();
}

export function createHttpApp(options: HttpGatewayOptions = {}): Express {
  const cwd = resolveCwd(options.cwd);
  const gateway = options.gateway ?? createGateway({ cwd });
  const app = express();

  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/v1/authorize', (req, res) => {
    const traceFallback = typeof req.body?.traceId === 'string' ? req.body.traceId : uuidv4();
    const agentFallback =
      typeof req.body?.agentId === 'string' ? req.body.agentId : 'unknown';

    const parsed = AuthorizeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(
        failClosedDecision(agentFallback, 'Invalid authorize request', traceFallback)
      );
      return;
    }

    const body = parsed.data;
    const shellId = body.shellId ?? body.agentId;
    const traceId = body.traceId ?? uuidv4();

    try {
      const decision = gateway.authorize({
        agentId: body.agentId,
        shellId,
        action: body.action,
        resource: body.resource,
        parameters: body.parameters,
        runId: body.runId,
        traceId,
      });
      res.status(200).json(toHttpDecision(decision, body.agentId, traceId));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Authorization evaluation failed';
      // Fail closed — never allow on gateway/policy errors; never leak stacks/secrets
      res.status(200).json(
        failClosedDecision(
          body.agentId,
          `Authorization failed (fail-closed): ${sanitizeErrorMessage(message)}`,
          traceId
        )
      );
    }
  });

  app.post('/v1/approvals', (req, res) => {
    const parsed = CreateApprovalBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid approval request' });
      return;
    }

    try {
      const body = parsed.data;
      const request = gateway.approvals.createRequest({
        agentId: body.agentId,
        shellId: body.shellId,
        action: body.action,
        resource: body.resource,
        reason: body.reason ?? 'Human approval requested',
        scope: (body.scope ?? 'once') as ApprovalScope,
      });
      res.status(201).json(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create approval';
      res.status(500).json({ error: sanitizeErrorMessage(message) });
    }
  });

  app.post('/v1/approvals/:id/grant', (req, res) => {
    const parsed = GrantBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'decidedBy is required' });
      return;
    }

    try {
      const result = gateway.approvals.grant(req.params.id, parsed.data.decidedBy);
      if (!result) {
        res.status(404).json({ error: 'Approval request not found or already decided' });
        return;
      }
      gateway.audit.emit('approval.granted', {
        agent_id: result.agent_id,
        shell_id: result.shell_id,
        action: result.action,
        resource: result.resource,
        decision: 'granted',
        metadata: { request_id: req.params.id, decided_by: parsed.data.decidedBy },
      });
      res.status(200).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to grant approval';
      res.status(500).json({ error: sanitizeErrorMessage(message) });
    }
  });

  app.post('/v1/approvals/:id/deny', (req, res) => {
    const parsed = DenyBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid deny request' });
      return;
    }

    const decidedBy = parsed.data.decidedBy ?? 'human';
    try {
      const result = gateway.approvals.deny(req.params.id, decidedBy);
      if (!result) {
        res.status(404).json({ error: 'Approval request not found or already decided' });
        return;
      }
      gateway.audit.emit('approval.denied', {
        agent_id: result.agent_id,
        shell_id: result.shell_id,
        action: result.action,
        resource: result.resource,
        decision: 'denied',
        metadata: { request_id: req.params.id, decided_by: decidedBy },
      });
      res.status(200).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deny approval';
      res.status(500).json({ error: sanitizeErrorMessage(message) });
    }
  });

  app.get('/v1/approvals/:id', (req, res) => {
    try {
      const result = gateway.approvals.get(req.params.id);
      if (!result) {
        res.status(404).json({ error: 'Approval request not found' });
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load approval';
      res.status(500).json({ error: sanitizeErrorMessage(message) });
    }
  });

  app.get('/v1/runs/:id/summary', (req, res) => {
    try {
      const projectConfig = loadProjectConfig(gateway.cwd);
      const summary = summaryFromAuditStore(
        req.params.id,
        gateway.audit,
        projectConfig.metadata.id
      );
      res.status(200).json(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate run summary';
      res.status(500).json({ error: sanitizeErrorMessage(message) });
    }
  });

  // Catch-all error handler — fail closed, never leak stacks/secrets
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: sanitizeErrorMessage(message) });
  });

  return app;
}

export function createHttpServer(options: HttpGatewayOptions = {}): {
  app: Express;
  gateway: PassportGateway;
  cwd: string;
} {
  const cwd = resolveCwd(options.cwd);
  const gateway = options.gateway ?? createGateway({ cwd });
  const app = createHttpApp({ cwd, gateway });
  return { app, gateway, cwd };
}
