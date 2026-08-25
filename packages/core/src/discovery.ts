import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { ProjectConfig } from './types.js';

export interface DiscoveryResult {
  signals: string[];
  language?: string;
  packageManager?: string;
  sourceDirs: string[];
  testDirs: string[];
  hasGit: boolean;
  gitRemote?: string;
  hasDocker: boolean;
  hasMcp: boolean;
  hasCi: boolean;
  hasK8s: boolean;
  projectName: string;
}

function pathExists(p: string): boolean {
  return existsSync(p);
}

function detectGit(cwd: string): { hasGit: boolean; remote?: string } {
  if (!pathExists(join(cwd, '.git'))) return { hasGit: false };
  try {
    const remote = execSync('git remote get-url origin', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return { hasGit: true, remote };
  } catch {
    return { hasGit: true };
  }
}

function detectPackageManager(cwd: string): { packageManager?: string; language?: string } {
  if (pathExists(join(cwd, 'package.json'))) {
    if (pathExists(join(cwd, 'pnpm-lock.yaml'))) return { packageManager: 'pnpm', language: 'typescript' };
    if (pathExists(join(cwd, 'yarn.lock'))) return { packageManager: 'yarn', language: 'typescript' };
    if (pathExists(join(cwd, 'package-lock.json'))) return { packageManager: 'npm', language: 'typescript' };
    return { packageManager: 'npm', language: 'typescript' };
  }
  if (pathExists(join(cwd, 'pyproject.toml')) || pathExists(join(cwd, 'requirements.txt'))) {
    return { packageManager: 'pip', language: 'python' };
  }
  if (pathExists(join(cwd, 'Cargo.toml'))) {
    return { packageManager: 'cargo', language: 'rust' };
  }
  if (pathExists(join(cwd, 'go.mod'))) {
    return { packageManager: 'go', language: 'go' };
  }
  return {};
}

function findDirs(cwd: string, candidates: string[]): string[] {
  return candidates.filter((d) => pathExists(join(cwd, d)) && statSync(join(cwd, d)).isDirectory());
}

export function discoverProject(cwd = process.cwd()): DiscoveryResult {
  const signals: string[] = [];
  const git = detectGit(cwd);
  if (git.hasGit) signals.push('Git repository');
  if (git.remote) signals.push(`GitHub remote: ${git.remote}`);

  const pkg = detectPackageManager(cwd);
  if (pkg.language) signals.push(pkg.language);
  if (pkg.packageManager) signals.push(`${pkg.packageManager} project`);

  const sourceDirs = findDirs(cwd, ['src', 'lib', 'app', 'packages']);
  for (const d of sourceDirs) signals.push(`${d}/`);

  const testDirs = findDirs(cwd, ['tests', 'test', '__tests__', 'spec']);
  for (const d of testDirs) signals.push(`${d}/ (tests)`);

  const hasDocker = pathExists(join(cwd, 'Dockerfile')) || pathExists(join(cwd, 'docker-compose.yml'));
  if (hasDocker) signals.push('Docker');

  const hasMcp =
    pathExists(join(cwd, '.cursor', 'mcp.json')) ||
    pathExists(join(cwd, 'mcp.json')) ||
    pathExists(join(cwd, '.mcp'));
  if (hasMcp) signals.push('MCP configuration');

  const hasCi =
    pathExists(join(cwd, '.github', 'workflows')) ||
    pathExists(join(cwd, '.gitlab-ci.yml')) ||
    pathExists(join(cwd, 'Jenkinsfile'));
  if (hasCi) signals.push('CI/CD');

  const hasK8s =
    pathExists(join(cwd, 'kubernetes')) ||
    readdirSync(cwd, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.ya?ml$/.test(e.name))
      .some((e) => readFileSync(join(cwd, e.name), 'utf8').includes('kind:'));

  if (hasK8s) signals.push('Kubernetes/Infrastructure manifests');

  const projectName = basename(cwd);

  return {
    signals,
    language: pkg.language,
    packageManager: pkg.packageManager,
    sourceDirs,
    testDirs,
    hasGit: git.hasGit,
    gitRemote: git.remote,
    hasDocker,
    hasMcp,
    hasCi,
    hasK8s,
    projectName,
  };
}

export function discoveryToProjectConfig(discovery: DiscoveryResult): ProjectConfig {
  return {
    apiVersion: 'agentpassport.dev/v1',
    kind: 'Project',
    metadata: {
      id: discovery.projectName,
      name: discovery.projectName,
      repository: discovery.gitRemote,
      policy_version: '1',
      discoveredAt: new Date().toISOString(),
    },
    discovery: {
      signals: discovery.signals,
      language: discovery.language,
      packageManager: discovery.packageManager,
    },
  };
}

export interface PermissionProposal {
  action: string;
  effect: 'allow' | 'deny' | 'approval';
  reason: string;
}

export function generatePermissionProposal(discovery: DiscoveryResult): PermissionProposal[] {
  const proposals: PermissionProposal[] = [
    { action: 'repository.read', effect: 'allow', reason: 'Read project source for agent operations' },
    { action: 'filesystem.read', effect: 'allow', reason: 'Read source files' },
    { action: 'filesystem.write', effect: 'allow', reason: 'Modify source in allowed directories' },
    { action: 'tests.run', effect: 'allow', reason: 'Run project tests' },
    { action: 'github.create_pr', effect: 'allow', reason: 'Create pull requests for changes' },
    { action: 'github.merge_pr', effect: 'approval', reason: 'Merge requires human approval' },
    { action: 'production.deploy', effect: 'deny', reason: 'Production deploy denied by default' },
    { action: 'deployment.execute', effect: 'deny', reason: 'Deployment execution denied by default' },
    { action: 'filesystem.read (.env)', effect: 'deny', reason: 'Secrets must not be exposed to agents' },
    { action: 'filesystem.read (secrets/)', effect: 'deny', reason: 'Secrets directory denied' },
  ];

  if (discovery.hasMcp) {
    proposals.push({
      action: 'mcp.tool.call',
      effect: 'approval',
      reason: 'MCP tools require per-tool policy evaluation',
    });
  }

  if (discovery.hasCi) {
    proposals.push({
      action: 'deployment.request',
      effect: 'approval',
      reason: 'CI/CD detected — deployment is approval-gated',
    });
  }

  return proposals;
}
