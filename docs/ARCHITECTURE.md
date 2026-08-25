# Architecture

Agent Passport v0.1 — system as built on 2026-08-26.

## Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (ES2022, NodeNext modules) |
| Runtime | Node.js ≥ 18 |
| Monorepo | npm workspaces |
| Schema validation | Zod |
| Policy/config storage | YAML on disk (`.agent/`) |
| Approval state | SQLite via `better-sqlite3` (`.agent/approvals.db`) |
| Audit log | Append-only JSONL (`.agent/audit.jsonl`) |
| Observability | OpenTelemetry SDK (`@opentelemetry/*`) |
| CLI | Commander |
| Python SDK | Python ≥ 3.10, PyYAML |

## Packages (services)

| Package | Path | Role |
|---------|------|------|
| `@agent-passport/core` | `packages/core` | Domain types, policy engine, gateway, audit, approval, discovery, summary |
| `@agent-passport/adapters` | `packages/adapters` | Tool execution boundaries: FS, GitHub, MCP, tests, deployment |
| `@agent-passport/telemetry` | `packages/telemetry` | OTel span helpers |
| `@agent-passport/cli` | `packages/cli` | Developer CLI |
| `agent-passport-sdk` | `sdk/typescript` | TypeScript SDK |
| `agent-passport` (PyPI name) | `sdk/python` | Python SDK |

## Deployment topology (v0.1)

Local-first, no hosted service in v0.1:

```
Developer machine
├── Project repo
│   └── .agent/           ← version-controlled config (except runtime DB/logs)
│       ├── project.yaml
│       ├── policy.yaml
│       ├── agents/*/passport.yaml
│       ├── audit.jsonl   ← append-only, local
│       ├── approvals.db  ← local SQLite
│       └── runs/<id>/    ← summaries per run
└── CLI / SDK invoke in-process gateway
```

Future (not built): HTTP Gateway (`POST /v1/authorize`), standalone MCP proxy process.

## Data model (summary)

See `FIELD_REFERENCE.md` for every field. Core entities:

- **AgentPassport** — portable agent identity + delegated permissions
- **ProjectPolicy** — project-wide rules, default denies, approval requirements
- **ProjectConfig** — discovery metadata
- **PolicyRule** — allow | deny | approval on action + resource
- **ApprovalRequest** — human approval lifecycle
- **AuditEvent** — immutable action/policy record
- **RunSummary** — aggregated metrics from audit events
- **ToolRequest / PolicyDecision / ToolOutcome** — gateway contract

## Role / permission matrix (baseline templates)

Effective authority = organization rules + project policy + passport permissions + active approvals.
Precedence: **DENY > APPROVAL_REQUIRED > ALLOW**.

| Action | Researcher | Coder | Reviewer | Deployer | Project default |
|--------|------------|-------|----------|----------|-----------------|
| `repository.read` | ✅ | ✅ | ✅ | ✅ | allow |
| `filesystem.read` | ✅ (excl. `.env`, secrets) | ✅ (scoped paths) | ✅ | ✅ | allow `./**` |
| `filesystem.write` | 🚫 | ✅ (src/tests/lib/app) | 🚫 | 🚫 | via passport |
| `search.execute` | ✅ | ✅ | — | — | — |
| `tests.run` | 🚫 | ✅ | ✅ | — | allow |
| `github.read` | ✅ | ✅ | ✅ | ✅ | — |
| `github.create_pr` | 🚫 | ✅ | 🚫 | 🚫 | allow |
| `github.merge_pr` | 🚫 | 🔐 | 🔐 | 🔐 | approval |
| `review.comment` | — | — | ✅ | — | allow |
| `production.read` | ✅ | ✅ | ✅ | ✅ | — |
| `production.deploy` | 🚫 | 🚫 | 🚫 | 🔐* | **deny** |
| `deployment.execute` | 🚫 | 🚫 | 🚫 | — | **deny** |

\* Deployer passport says `deploy: approval`, but project rule `project:deny-production-deploy` (priority 1000) wins → **DENY**.

## Authorization flow

```
Agent/runtime → ToolRequest
             → PassportGateway.authorize()
             → PolicyEngine.evaluatePolicy()
             → AuditStore.emit()
             → [ALLOW/APPROVED] → Adapter.execute() → audit outcome
             → [APPROVAL_REQUIRED] → ApprovalManager.createRequest() → blocked
             → [DENY] → blocked
```

Prompts are advisory. The gateway is the enforcement boundary.

## MCP enforcement (adapter-level v0.1)

`McpGatewayAdapter.intercept()` evaluates policy **before** forwarding. No standalone MCP proxy server yet.

## OpenTelemetry spans

| Span | Attributes |
|------|------------|
| `agent.run` | run_id, project_id, trace_id |
| `agent.role_switch` | from_shell, to_shell |
| `policy.check` | action, resource, decision, rule_ids |
| `tool.call` | tool_name, adapter, action, resource |

## Failure modes

| Failure | Behavior |
|---------|----------|
| Policy engine error | Fail closed (throws; no execution) |
| Approval DB unavailable | Approval-required actions blocked |
| Telemetry unavailable | Run continues; spans may be missing |
| Passport / project missing | Gateway throws on load |

---

## Invariants (must never break)

Each invariant has a pinning test where noted. Gaps are listed in `PROGRESS.md`.

| ID | Invariant | Pinning test |
|----|-----------|--------------|
| INV-01 | Policy precedence: DENY beats APPROVAL beats ALLOW | `packages/core/src/policy-engine.test.ts` — org deny overrides allow |
| INV-02 | Organization deny overrides project allow | `packages/core/src/integration.test.ts` — organization deny |
| INV-03 | Production deploy denied by project default | `packages/core/src/policy-engine.test.ts` — coder production.deploy deny; `integration.test.ts` — deployer deny |
| INV-04 | Merge PR requires human approval (no active grant) | `policy-engine.test.ts` — merge_pr approval_required; live: `cli demo` |
| INV-05 | Researcher cannot write source | `integration.test.ts` — blocks researcher write |
| INV-06 | Secrets paths denied (`.env`, `secrets/**`) | `policy-engine.test.ts` — denies secrets path |
| INV-07 | Agent cannot self-approve (no approval record) | `policy-engine.test.ts` — privilege escalation; `integration.test.ts` — escalation attempt |
| INV-08 | MCP adapter blocks denied/approval_required before forward | `packages/adapters/src/mcp.test.ts` |
| INV-09 | Gateway evaluates policy before adapter execution | `integration.test.ts` — gateway authorize; live: `cli demo` |
| INV-10 | Audit log is append-only (no update/delete API) | **Code inspection only** — `AuditStore.append()` uses `appendFileSync`; no delete method. No adversarial test yet. |
| INV-11 | Memory never grants authority | **Not tested** — memory dirs exist; no memory→policy path in code |
| INV-12 | Run summary metrics come from audit events, not LLM | Live: `cli demo` → `summary` JSON matches audit.jsonl counts |
| INV-13 | High-risk actions default deny without explicit allow | `policy-engine.test.ts` — DEFAULT_DENIED_ACTIONS |

## Core principle

> The agent requests. The Passport decides. The gateway enforces. OpenTelemetry records. The summary reports verified work.
