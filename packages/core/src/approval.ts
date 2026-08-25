import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { ApprovalRequest, ApprovalScope } from './types.js';
import { approvalStorePath } from './paths.js';

export class ApprovalManager {
  private db: Database.Database;
  private readonly cwd: string;

  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
    const path = approvalStorePath(cwd);
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approvals (
        request_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        shell_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        reason TEXT NOT NULL,
        requested_scope TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        expires_at TEXT,
        decided_at TEXT,
        decided_by TEXT,
        run_id TEXT,
        trace_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approvals(agent_id, status);
      CREATE INDEX IF NOT EXISTS idx_approvals_action ON approvals(action, resource, status);
    `);
  }

  createRequest(input: {
    agentId: string;
    shellId: string;
    action: string;
    resource: string;
    reason: string;
    scope?: ApprovalScope;
    runId?: string;
    traceId?: string;
    expiresInMs?: number;
  }): ApprovalRequest {
    const now = new Date();
    const request: ApprovalRequest = {
      request_id: uuidv4(),
      agent_id: input.agentId,
      shell_id: input.shellId,
      action: input.action,
      resource: input.resource,
      reason: input.reason,
      requested_scope: input.scope ?? 'once',
      status: 'pending',
      created_at: now.toISOString(),
      expires_at: input.expiresInMs
        ? new Date(now.getTime() + input.expiresInMs).toISOString()
        : undefined,
      run_id: input.runId,
      trace_id: input.traceId,
    };

    this.db
      .prepare(
        `INSERT INTO approvals (
          request_id, agent_id, shell_id, action, resource, reason,
          requested_scope, status, created_at, expires_at, run_id, trace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        request.request_id,
        request.agent_id,
        request.shell_id,
        request.action,
        request.resource,
        request.reason,
        request.requested_scope,
        request.status,
        request.created_at,
        request.expires_at ?? null,
        request.run_id ?? null,
        request.trace_id ?? null
      );

    return request;
  }

  grant(requestId: string, decidedBy: string): ApprovalRequest | undefined {
    const now = new Date().toISOString();
    const row = this.get(requestId);
    if (!row || row.status !== 'pending') return undefined;

    const expiresAt = this.computeExpiry(row.requested_scope, now);

    this.db
      .prepare(
        `UPDATE approvals SET status = 'granted', decided_at = ?, decided_by = ?, expires_at = ? WHERE request_id = ?`
      )
      .run(now, decidedBy, expiresAt, requestId);

    return this.get(requestId);
  }

  deny(requestId: string, decidedBy: string): ApprovalRequest | undefined {
    const now = new Date().toISOString();
    const row = this.get(requestId);
    if (!row || row.status !== 'pending') return undefined;

    this.db
      .prepare(`UPDATE approvals SET status = 'denied', decided_at = ?, decided_by = ? WHERE request_id = ?`)
      .run(now, decidedBy, requestId);

    return this.get(requestId);
  }

  get(requestId: string): ApprovalRequest | undefined {
    const row = this.db
      .prepare(`SELECT * FROM approvals WHERE request_id = ?`)
      .get(requestId) as Record<string, string> | undefined;
    return row ? this.rowToRequest(row) : undefined;
  }

  listPending(agentId?: string): ApprovalRequest[] {
    const rows = agentId
      ? (this.db
          .prepare(`SELECT * FROM approvals WHERE status = 'pending' AND agent_id = ?`)
          .all(agentId) as Record<string, string>[])
      : (this.db.prepare(`SELECT * FROM approvals WHERE status = 'pending'`).all() as Record<
          string,
          string
        >[]);
    return rows.map((r) => this.rowToRequest(r));
  }

  listGranted(agentId?: string): ApprovalRequest[] {
    const now = new Date().toISOString();
    const rows = agentId
      ? (this.db
          .prepare(
            `SELECT * FROM approvals WHERE status = 'granted' AND agent_id = ? AND (expires_at IS NULL OR expires_at > ?)`
          )
          .all(agentId, now) as Record<string, string>[])
      : (this.db
          .prepare(
            `SELECT * FROM approvals WHERE status = 'granted' AND (expires_at IS NULL OR expires_at > ?)`
          )
          .all(now) as Record<string, string>[]);
    return rows.map((r) => this.rowToRequest(r));
  }

  /**
   * Consume a once-scoped approval after successful use so it cannot be replayed.
   * Session/project/permanent grants remain until expiry.
   */
  consumeOnce(requestId: string): boolean {
    const row = this.get(requestId);
    if (!row || row.status !== 'granted') return false;
    if (row.requested_scope !== 'once') return false;
    this.db
      .prepare(`UPDATE approvals SET status = 'expired', expires_at = ? WHERE request_id = ?`)
      .run(new Date().toISOString(), requestId);
    return true;
  }

  private computeExpiry(scope: ApprovalScope, decidedAt: string): string | null {
    const base = new Date(decidedAt);
    switch (scope) {
      case 'once':
        return new Date(base.getTime() + 5 * 60 * 1000).toISOString();
      case 'session':
        return new Date(base.getTime() + 8 * 60 * 60 * 1000).toISOString();
      case 'project':
        return new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      case 'permanent':
        return null;
      default:
        return new Date(base.getTime() + 5 * 60 * 1000).toISOString();
    }
  }

  private rowToRequest(row: Record<string, string>): ApprovalRequest {
    return {
      request_id: row.request_id,
      agent_id: row.agent_id,
      shell_id: row.shell_id,
      action: row.action,
      resource: row.resource,
      reason: row.reason,
      requested_scope: row.requested_scope as ApprovalScope,
      status: row.status as ApprovalRequest['status'],
      created_at: row.created_at,
      expires_at: row.expires_at ?? undefined,
      decided_at: row.decided_at ?? undefined,
      decided_by: row.decided_by ?? undefined,
      run_id: row.run_id ?? undefined,
      trace_id: row.trace_id ?? undefined,
    };
  }

  close(): void {
    this.db.close();
  }
}

export function createApprovalManager(cwd?: string): ApprovalManager {
  return new ApprovalManager(cwd);
}
