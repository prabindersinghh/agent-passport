import { v4 as uuidv4 } from 'uuid';
import {
  AgentPassport,
  PolicyDecision,
  ProjectPolicy,
  RunSummary,
  ToolOutcome,
  ToolRequest,
} from './types.js';
import {
  evaluatePolicy,
  canExecute,
  requiresApproval,
  isDenied,
  decisionToAuditDecision,
  EvaluationContext,
} from './policy-engine.js';
import { AuditStore, createAuditStore } from './audit.js';
import { ApprovalManager, createApprovalManager } from './approval.js';
import {
  loadPassport,
  loadProjectPolicy,
  loadProjectConfig,
  agentPassportPath,
  isAgentPassportInitialized,
} from './paths.js';

export interface GatewayOptions {
  cwd?: string;
  audit?: AuditStore;
  approvals?: ApprovalManager;
}

export interface AuthorizeInput {
  agentId: string;
  shellId: string;
  action: string;
  resource: string;
  traceId?: string;
  runId?: string;
  parameters?: unknown;
}

export interface ExecuteResult {
  decision: PolicyDecision;
  executed: boolean;
  outcome?: ToolOutcome;
  approvalRequestId?: string;
}

export type ToolExecutor = (
  request: ToolRequest,
  decision: PolicyDecision
) => Promise<ToolOutcome>;

export class PassportGateway {
  readonly cwd: string;
  readonly audit: AuditStore;
  readonly approvals: ApprovalManager;

  constructor(options: GatewayOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.audit = options.audit ?? createAuditStore(this.cwd);
    this.approvals = options.approvals ?? createApprovalManager(this.cwd);
  }

  loadContext(agentId: string): {
    passport: AgentPassport;
    projectPolicy: ProjectPolicy;
    projectId: string;
  } {
    if (!isAgentPassportInitialized(this.cwd)) {
      throw new Error('Project not initialized. Run: agent-passport init');
    }
    const passport = loadPassport(agentPassportPath(agentId, this.cwd));
    const projectPolicy = loadProjectPolicy(this.cwd);
    const projectConfig = loadProjectConfig(this.cwd);
    return {
      passport,
      projectPolicy,
      projectId: projectConfig.metadata.id,
    };
  }

  authorize(input: AuthorizeInput): PolicyDecision {
    const { passport, projectPolicy, projectId } = this.loadContext(input.agentId);
    const traceId = input.traceId ?? uuidv4();
    const runId = input.runId;

    const ctx: EvaluationContext = {
      passport,
      projectPolicy,
      approvals: this.approvals.listGranted(input.agentId),
    };

    const decision = evaluatePolicy(
      { action: input.action, resource: input.resource },
      ctx
    );

    this.audit.emit('policy.evaluated', {
      run_id: runId,
      agent_id: input.agentId,
      shell_id: input.shellId,
      project_id: projectId,
      action: input.action,
      resource: input.resource,
      decision: decisionToAuditDecision(decision.effect),
      trace_id: traceId,
      metadata: {
        ruleIds: decision.ruleIds,
        reason: decision.reason,
        policySource: decision.policySource,
      },
    });

    this.audit.emit('agent.action.requested', {
      run_id: runId,
      agent_id: input.agentId,
      shell_id: input.shellId,
      project_id: projectId,
      action: input.action,
      resource: input.resource,
      trace_id: traceId,
    });

    if (canExecute(decision)) {
      this.audit.emit('action.allowed', {
        run_id: runId,
        agent_id: input.agentId,
        shell_id: input.shellId,
        project_id: projectId,
        action: input.action,
        resource: input.resource,
        decision: 'allow',
        trace_id: traceId,
      });
    } else if (requiresApproval(decision)) {
      this.audit.emit('approval.requested', {
        run_id: runId,
        agent_id: input.agentId,
        shell_id: input.shellId,
        project_id: projectId,
        action: input.action,
        resource: input.resource,
        decision: 'approval_required',
        trace_id: traceId,
      });
    } else if (isDenied(decision)) {
      this.audit.emit('action.denied', {
        run_id: runId,
        agent_id: input.agentId,
        shell_id: input.shellId,
        project_id: projectId,
        action: input.action,
        resource: input.resource,
        decision: 'deny',
        trace_id: traceId,
        metadata: { reason: decision.reason },
      });
    }

    return decision;
  }

  async execute(
    input: AuthorizeInput,
    executor: ToolExecutor
  ): Promise<ExecuteResult> {
    const { projectId } = this.loadContext(input.agentId);
    const traceId = input.traceId ?? uuidv4();
    const decision = this.authorize({ ...input, traceId });

    const request: ToolRequest = {
      agentId: input.agentId,
      projectId,
      shellId: input.shellId,
      action: input.action,
      resource: input.resource,
      parameters: input.parameters,
      traceId,
      runId: input.runId,
    };

    if (requiresApproval(decision)) {
      const approvalReq = this.approvals.createRequest({
        agentId: input.agentId,
        shellId: input.shellId,
        action: input.action,
        resource: input.resource,
        reason: decision.reason,
        runId: input.runId,
        traceId,
      });
      return {
        decision,
        executed: false,
        approvalRequestId: approvalReq.request_id,
      };
    }

    if (isDenied(decision)) {
      return { decision, executed: false };
    }

    this.audit.emit('tool.started', {
      run_id: input.runId,
      agent_id: input.agentId,
      shell_id: input.shellId,
      project_id: projectId,
      action: input.action,
      resource: input.resource,
      trace_id: traceId,
    });

    const start = Date.now();
    let outcome: ToolOutcome;
    try {
      outcome = await executor(request, decision);
      outcome.durationMs = Date.now() - start;
    } catch (err) {
      outcome = {
        success: false,
        errorCode: err instanceof Error ? err.message : 'UNKNOWN_ERROR',
        durationMs: Date.now() - start,
      };
    }

    if (outcome.success) {
      this.audit.emit('tool.completed', {
        run_id: input.runId,
        agent_id: input.agentId,
        shell_id: input.shellId,
        project_id: projectId,
        action: input.action,
        resource: input.resource,
        outcome: 'success',
        trace_id: traceId,
        metadata: { durationMs: outcome.durationMs, resultRef: outcome.resultRef },
      });
    } else {
      this.audit.emit('tool.failed', {
        run_id: input.runId,
        agent_id: input.agentId,
        shell_id: input.shellId,
        project_id: projectId,
        action: input.action,
        resource: input.resource,
        outcome: 'failed',
        trace_id: traceId,
        metadata: { errorCode: outcome.errorCode },
      });
    }

    return { decision, executed: true, outcome };
  }

  switchRole(input: {
    fromShell: string;
    toShell: string;
    agentId: string;
    runId?: string;
    traceId?: string;
    reason?: string;
  }): void {
    const { projectId } = this.loadContext(input.agentId);
    this.audit.emit('agent.role_switch', {
      run_id: input.runId,
      agent_id: input.agentId,
      shell_id: input.toShell,
      project_id: projectId,
      trace_id: input.traceId ?? uuidv4(),
      metadata: {
        from_shell: input.fromShell,
        to_shell: input.toShell,
        reason: input.reason,
      },
    });
  }

  startRun(agentId: string, shellId: string, runId: string, traceId: string): void {
    const { projectId } = this.loadContext(agentId);
    this.audit.emit('agent.started', {
      run_id: runId,
      agent_id: agentId,
      shell_id: shellId,
      project_id: projectId,
      trace_id: traceId,
    });
  }

  endRun(agentId: string, shellId: string, runId: string, traceId: string): void {
    const { projectId } = this.loadContext(agentId);
    this.audit.emit('agent.completed', {
      run_id: runId,
      agent_id: agentId,
      shell_id: shellId,
      project_id: projectId,
      trace_id: traceId,
    });
  }

  close(): void {
    this.approvals.close();
  }
}

export function createGateway(options?: GatewayOptions): PassportGateway {
  return new PassportGateway(options);
}

export { RunSummary };
