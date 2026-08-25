import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { AuditEvent, AuditEventType } from './types.js';
import { auditStorePath } from './paths.js';

export class AuditStore {
  private readonly path: string;
  private readonly cwd: string;

  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
    this.path = auditStorePath(cwd);
  }

  append(event: Omit<AuditEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): AuditEvent {
    const full: AuditEvent = {
      id: event.id ?? uuidv4(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      type: event.type,
      run_id: event.run_id,
      agent_id: event.agent_id,
      shell_id: event.shell_id,
      project_id: event.project_id,
      action: event.action,
      resource: event.resource,
      decision: event.decision,
      outcome: event.outcome,
      trace_id: event.trace_id,
      metadata: event.metadata,
    };
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, JSON.stringify(full) + '\n', 'utf8');
    return full;
  }

  readAll(): AuditEvent[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEvent);
  }

  readByRun(runId: string): AuditEvent[] {
    return this.readAll().filter((e) => e.run_id === runId);
  }

  emit(type: AuditEventType, fields: Omit<AuditEvent, 'id' | 'timestamp' | 'type'>): AuditEvent {
    return this.append({ type, ...fields });
  }
}

export function createAuditStore(cwd?: string): AuditStore {
  return new AuditStore(cwd);
}
