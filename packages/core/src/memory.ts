import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentMemoryPath, ensureAgentStructure } from './paths.js';

/**
 * Local-first memory store.
 * Memory never grants authority — policy alone does (INV-11).
 */
export interface MemoryEntry {
  id: string;
  timestamp: string;
  kind: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export class MemoryStore {
  private readonly dir: string;
  private readonly file: string;

  constructor(agentId: string, cwd = process.cwd()) {
    ensureAgentStructure(cwd);
    this.dir = agentMemoryPath(agentId, cwd);
    mkdirSync(this.dir, { recursive: true });
    this.file = join(this.dir, 'entries.jsonl');
  }

  append(entry: Omit<MemoryEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): MemoryEntry {
    const full: MemoryEntry = {
      id: entry.id ?? `mem_${Date.now().toString(36)}`,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      kind: entry.kind,
      content: entry.content,
      metadata: entry.metadata,
    };
    appendFileSync(this.file, JSON.stringify(full) + '\n', 'utf8');
    return full;
  }

  readAll(): MemoryEntry[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as MemoryEntry);
  }

  /** Explicit: memory must never be used as an authorization source. */
  grantsAuthority(): false {
    return false;
  }
}

export function createMemoryStore(agentId: string, cwd?: string): MemoryStore {
  return new MemoryStore(agentId, cwd);
}
