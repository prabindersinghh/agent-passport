import { AgentRole, AgentPassport, ProjectPolicy } from './types.js';

export interface ShellTemplate {
  id: AgentRole;
  name: string;
  description: string;
  capabilities: string[];
  permissions: AgentPassport['permissions'];
}

export const SHELL_TEMPLATES: Record<AgentRole, ShellTemplate> = {
  researcher: {
    id: 'researcher',
    name: 'Researcher',
    description: 'Read repository, docs/search, inspect logs — no source writes',
    capabilities: ['repository.read', 'filesystem.read', 'search.execute'],
    permissions: {
      repository: { read: true },
      filesystem: {
        allow: ['./**'],
        deny: ['./.env', './secrets/**', './.agent/**'],
      },
      search: { execute: true },
      github: { read: true, create_pr: false, merge_pr: false },
      production: { read: true, deploy: false },
      tests: { run: false },
    },
  },
  coder: {
    id: 'coder',
    name: 'Coder',
    description: 'Read/write source, run tests, create PR — no production deploy',
    capabilities: [
      'repository.read',
      'filesystem.read',
      'filesystem.write',
      'tests.run',
      'github.read',
      'github.create_pr',
    ],
    permissions: {
      repository: { read: true },
      filesystem: {
        allow: ['./src/**', './tests/**', './test/**', './lib/**', './app/**'],
        deny: ['./.env', './secrets/**'],
      },
      tests: { run: true },
      github: { read: true, create_pr: true, merge_pr: 'approval' },
      production: { read: true, deploy: false },
      search: { execute: true },
    },
  },
  reviewer: {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Read source, run tests, review — no mutation or deploy',
    capabilities: ['repository.read', 'filesystem.read', 'tests.run', 'github.read', 'review.comment'],
    permissions: {
      repository: { read: true },
      filesystem: {
        allow: ['./**'],
        deny: ['./.env', './secrets/**'],
      },
      tests: { run: true },
      github: { read: true, create_pr: false, merge_pr: 'approval' },
      production: { read: true, deploy: false },
    },
  },
  deployer: {
    id: 'deployer',
    name: 'Deployer',
    description: 'Deployment operations — production deploy requires approval',
    capabilities: [
      'repository.read',
      'filesystem.read',
      'production.read',
      'deployment.request',
      'deployment.execute',
    ],
    permissions: {
      repository: { read: true },
      filesystem: { allow: ['./**'], deny: ['./.env', './secrets/**'] },
      production: { read: true, deploy: 'approval' },
      github: { read: true, create_pr: false, merge_pr: 'approval' },
    },
  },
  custom: {
    id: 'custom',
    name: 'Custom Agent',
    description: 'Custom agent with minimal default permissions',
    capabilities: ['repository.read', 'filesystem.read'],
    permissions: {
      repository: { read: true },
      filesystem: { allow: ['./**'], deny: ['./.env', './secrets/**'] },
    },
  },
};

export function createPassportFromTemplate(
  template: ShellTemplate,
  options: { owner: string; projectId?: string }
): AgentPassport {
  const now = new Date().toISOString();
  return {
    apiVersion: 'agentpassport.dev/v1',
    kind: 'AgentPassport',
    metadata: {
      id: template.id,
      project: options.projectId,
      createdAt: now,
      updatedAt: now,
    },
    identity: {
      owner: options.owner,
      role: template.id,
      name: template.name,
      description: template.description,
    },
    capabilities: [...template.capabilities],
    policyRef: '.agent/policy.yaml',
    permissions: template.permissions,
  };
}

export function createBaselineProjectPolicy(projectId: string): ProjectPolicy {
  return {
    apiVersion: 'agentpassport.dev/v1',
    kind: 'ProjectPolicy',
    metadata: {
      id: projectId,
      version: '1',
      name: projectId,
      activated: false,
    },
    defaultDeny: ['production.deploy', 'deployment.execute'],
    require_approval: ['github.merge_pr', 'production.deploy'],
    rules: [
      {
        id: 'project:deny-production-deploy',
        effect: 'deny',
        action: 'production.deploy',
        resource: '*',
        priority: 1000,
        source: 'project',
        reason: 'Production deployment denied by default',
      },
      {
        id: 'project:approval-merge-pr',
        effect: 'approval',
        action: 'github.merge_pr',
        resource: '*',
        priority: 500,
        source: 'project',
        reason: 'Merge requires human approval',
      },
      {
        id: 'project:allow-fs-read',
        effect: 'allow',
        action: 'filesystem.read',
        resource: './**',
        priority: 100,
        source: 'project',
      },
      {
        id: 'project:allow-tests',
        effect: 'allow',
        action: 'tests.run',
        resource: '*',
        priority: 100,
        source: 'project',
      },
      {
        id: 'project:allow-create-pr',
        effect: 'allow',
        action: 'github.create_pr',
        resource: '*',
        priority: 100,
        source: 'project',
      },
      {
        id: 'project:allow-review',
        effect: 'allow',
        action: 'review.comment',
        resource: '*',
        priority: 100,
        source: 'project',
      },
      {
        id: 'project:deny-secrets',
        effect: 'deny',
        action: 'filesystem.*',
        resource: './secrets/**',
        priority: 900,
        source: 'project',
        reason: 'Secrets directory is denied',
      },
      {
        id: 'project:deny-env',
        effect: 'deny',
        action: 'filesystem.*',
        resource: './.env',
        priority: 900,
        source: 'project',
        reason: '.env file access denied',
      },
    ],
  };
}

export function createAgentPassport(
  name: string,
  options: { owner: string; role?: AgentRole; projectId?: string }
): AgentPassport {
  const role = options.role ?? 'custom';
  const template = SHELL_TEMPLATES[role];
  const passport = createPassportFromTemplate(
    { ...template, id: name as AgentRole },
    options
  );
  passport.metadata.id = name;
  passport.identity.role = role;
  return passport;
}
