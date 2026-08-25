# Field Reference

Plain-language reference for every persisted model and store. Internal field names match code (`packages/core/src/types.ts`).

---

## On-disk layout (`.agent/`)

| Path | Kind | Purpose |
|------|------|---------|
| `.agent/project.yaml` | ProjectConfig | Project identity + discovery snapshot |
| `.agent/policy.yaml` | ProjectPolicy | Rules governing all agents in this project |
| `.agent/agents/<id>/passport.yaml` | AgentPassport | One agent shell identity |
| `.agent/agents/<id>/memory/` | Directory | Future memory namespace (no engine v0.1) |
| `.agent/audit.jsonl` | Audit log | Append-only record of actions and decisions |
| `.agent/approvals.db` | SQLite | Human approval requests and grants |
| `.agent/runs/<run-id>/summary.json` | RunSummary | Machine-derived run report |
| `.agent/runs/<run-id>/summary.txt` | Text | Human-readable summary |

Portable agent identities (agent-first, no project): `~/.agent-passport/agents/<id>/passport.yaml`

---

## AgentPassport (`passport.yaml`)

**What it means:** Who this agent is and what it is allowed to *request* — not what the project automatically grants.

| Field | Type | Meaning |
|-------|------|---------|
| `apiVersion` | string | Must be `agentpassport.dev/v1` |
| `kind` | string | Must be `AgentPassport` |
| `metadata.id` | string | Stable agent identifier (e.g. `coder`) |
| `metadata.project` | string? | Attached project id |
| `metadata.createdAt` | ISO string? | Creation time |
| `metadata.updatedAt` | ISO string? | Last update |
| `identity.owner` | string | Human or org that owns this agent |
| `identity.role` | enum | `researcher` \| `coder` \| `reviewer` \| `deployer` \| `custom` |
| `identity.name` | string? | Display name |
| `identity.description` | string? | Role description |
| `capabilities` | string[] | Action categories this agent may request |
| `policyRef` | string? | Path to project policy (usually `.agent/policy.yaml`) |
| `permissions` | object | Per-domain allow/deny/approval rules (see below) |
| `runtime` | object? | Adapter metadata for external runtimes |

### `permissions` sub-fields

| Path | Values | Meaning |
|------|--------|---------|
| `filesystem.allow` | glob[] | Paths agent may read/write |
| `filesystem.deny` | glob[] | Paths always blocked |
| `github.read` | bool \| `approval` | Read repo/PR metadata |
| `github.create_pr` | bool \| `approval` | Open pull requests |
| `github.merge_pr` | bool \| `approval` | Merge pull requests |
| `production.read` | bool \| `approval` | Read deployment state |
| `production.deploy` | bool \| `approval` | Deploy to production |
| `tests.run` | bool \| `approval` | Run test suite |
| `repository.read` | bool \| `approval` | Read repository |
| `search.execute` | bool \| `approval` | Search/docs |
| `mcp.allow` | string[] | Allowed MCP tool patterns |
| `mcp.deny` | string[] | Denied MCP tool patterns |

---

## ProjectPolicy (`policy.yaml`)

**What it means:** Project-wide rules every agent must obey. Higher-priority denies cannot be overridden by agent passports.

| Field | Type | Meaning |
|-------|------|---------|
| `metadata.id` | string | Project policy id |
| `metadata.version` | string/number | Policy version |
| `metadata.activated` | bool | Whether policy is active |
| `metadata.activatedAt` | ISO string? | When activated |
| `organization.rules` | PolicyRule[]? | Org-level rules (strongest) |
| `rules` | PolicyRule[] | Project rules |
| `require_approval` | string[]? | Actions listed for documentation; enforced via rules |
| `defaultDeny` | string[]? | Actions denied unless explicitly allowed |

### PolicyRule

| Field | Type | Meaning |
|-------|------|---------|
| `id` | string? | Stable rule id |
| `effect` | enum | `allow` \| `deny` \| `approval` |
| `action` | string | Action name or prefix (e.g. `filesystem.read`, `github.*`) |
| `resource` | string | Resource glob (default `*`) |
| `priority` | number? | Higher wins within same effect tier |
| `source` | string? | `organization` \| `project` \| `passport` \| `session` |
| `reason` | string? | Human-readable explanation |

---

## ProjectConfig (`project.yaml`)

| Field | Meaning |
|-------|---------|
| `metadata.id` | Project name/id |
| `metadata.repository` | Git remote if discovered |
| `metadata.policy_version` | Linked policy version |
| `metadata.discoveredAt` | When discovery ran |
| `discovery.signals` | Human-readable discovery results |
| `discovery.language` | e.g. `typescript`, `python` |
| `discovery.packageManager` | e.g. `npm`, `pnpm` |

---

## ApprovalRequest (SQLite `approvals` table)

**What it means:** A human must decide before a protected action runs.

| Field | Meaning |
|-------|---------|
| `request_id` | Unique id (UUID) |
| `agent_id` | Agent that requested |
| `shell_id` | Active shell/role |
| `action` | Requested action |
| `resource` | Target resource |
| `reason` | Why approval is needed |
| `requested_scope` | `once` \| `session` \| `project` \| `permanent` |
| `status` | `pending` \| `granted` \| `denied` \| `expired` |
| `created_at` | Request timestamp |
| `expires_at` | Grant expiry (null = permanent scope) |
| `decided_at` | When human decided |
| `decided_by` | Approver identity |
| `run_id` | Linked agent run |
| `trace_id` | OTel trace correlation |

---

## AuditEvent (`audit.jsonl`, one JSON object per line)

**What it means:** Immutable record that something was requested, decided, or executed. Append-only.

| Field | Meaning |
|-------|---------|
| `id` | Event UUID |
| `type` | See event types below |
| `timestamp` | ISO time |
| `run_id` | Agent run |
| `agent_id` | Agent |
| `shell_id` | Shell/role |
| `project_id` | Project |
| `action` | Action name |
| `resource` | Resource |
| `decision` | `allow` \| `deny` \| `approval_required` |
| `outcome` | `success` \| `failed` |
| `trace_id` | OTel trace |
| `metadata` | Extra structured data (no secrets) |

### Audit event types

`agent.started`, `agent.completed`, `agent.role_switch`, `agent.action.requested`, `policy.evaluated`, `action.allowed`, `action.denied`, `approval.requested`, `approval.granted`, `approval.denied`, `tool.started`, `tool.completed`, `tool.failed`, `artifact.change`, `security.violation`, `summary.generated`

---

## Gateway runtime types (in-memory)

### ToolRequest

| Field | Meaning |
|-------|---------|
| `agentId` | Agent performing action |
| `projectId` | Project context |
| `shellId` | Active shell |
| `action` | e.g. `github.merge_pr` |
| `resource` | e.g. `repo/example/pr/184` |
| `parameters` | Adapter-specific payload |
| `traceId` | Correlation id |
| `runId` | Run id |

### PolicyDecision

| Field | Meaning |
|-------|---------|
| `effect` | `allow` \| `deny` \| `approval_required` \| `approved` \| `expired` |
| `reason` | Explanation |
| `ruleIds` | Rules that matched |
| `approvalRequestId` | If approved via grant |
| `policySource` | Which layer decided |

### RunSummary

| Field | Meaning |
|-------|---------|
| `run_id` | Run identifier |
| `duration_ms` | Wall time from first to last audit event |
| `trace_id` | OTel trace |
| `shells[]` | Per-role action counts |
| `totals` | Aggregated metrics |
| `final_outcome` | e.g. `COMPLETED_WITH_APPROVAL_PENDING` |
| `files_changed` | Paths touched |

---

## Action catalog (standard action names)

`filesystem.read`, `filesystem.write`, `repository.read`, `search.execute`, `tests.run`, `github.read`, `github.create_pr`, `github.merge_pr`, `production.read`, `production.deploy`, `deployment.request`, `deployment.execute`, `mcp.tool.call`, `review.comment`, `review.approve`

**High-risk (default deny without explicit allow):** `production.deploy`, `deployment.execute`
