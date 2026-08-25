import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import yaml from 'js-yaml';
import {
  AgentPassport,
  AgentPassportSchema,
  ProjectConfig,
  ProjectConfigSchema,
  ProjectPolicy,
  ProjectPolicySchema,
} from './types.js';

export const AGENT_DIR = '.agent';
export const PASSPORT_DIR = 'passport';
export const POLICIES_DIR = 'policies';
export const AGENTS_DIR = 'agents';
export const RUNS_DIR = 'runs';
export const MEMORY_DIR = 'memory';
export const TELEMETRY_DIR = 'telemetry';

export function agentRoot(cwd = process.cwd()): string {
  return join(cwd, AGENT_DIR);
}

export function projectConfigPath(cwd = process.cwd()): string {
  return join(agentRoot(cwd), 'project.yaml');
}

export function projectPolicyPath(cwd = process.cwd()): string {
  return join(agentRoot(cwd), 'policy.yaml');
}

export function agentPassportPath(agentId: string, cwd = process.cwd()): string {
  return join(agentRoot(cwd), AGENTS_DIR, agentId, 'passport.yaml');
}

export function agentMemoryPath(agentId: string, cwd = process.cwd()): string {
  return join(agentRoot(cwd), AGENTS_DIR, agentId, MEMORY_DIR);
}

export function runDir(runId: string, cwd = process.cwd()): string {
  return join(agentRoot(cwd), RUNS_DIR, runId);
}

export function auditStorePath(cwd = process.cwd()): string {
  return join(agentRoot(cwd), 'audit.jsonl');
}

export function approvalStorePath(cwd = process.cwd()): string {
  return join(agentRoot(cwd), 'approvals.db');
}

export function loadYamlFile<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  return yaml.load(raw) as T;
}

export function saveYamlFile(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, yaml.dump(data, { lineWidth: 120, noRefs: true }), 'utf8');
}

export function loadPassport(path: string): AgentPassport {
  const data = loadYamlFile<unknown>(path);
  return AgentPassportSchema.parse(data);
}

export function loadProjectPolicy(cwd = process.cwd()): ProjectPolicy {
  const path = projectPolicyPath(cwd);
  const data = loadYamlFile<unknown>(path);
  return ProjectPolicySchema.parse(data);
}

export function loadProjectConfig(cwd = process.cwd()): ProjectConfig {
  const path = projectConfigPath(cwd);
  const data = loadYamlFile<unknown>(path);
  return ProjectConfigSchema.parse(data);
}

export function isAgentPassportInitialized(cwd = process.cwd()): boolean {
  return existsSync(projectConfigPath(cwd)) && existsSync(projectPolicyPath(cwd));
}

export function ensureAgentStructure(cwd = process.cwd()): void {
  const root = agentRoot(cwd);
  for (const dir of [AGENTS_DIR, RUNS_DIR, MEMORY_DIR, TELEMETRY_DIR]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
}

export function listAgentIds(cwd = process.cwd()): string[] {
  const agentsPath = join(agentRoot(cwd), AGENTS_DIR);
  if (!existsSync(agentsPath)) return [];
  return readdirSync(agentsPath).filter((name) => {
    const p = join(agentsPath, name, 'passport.yaml');
    return existsSync(p);
  });
}
