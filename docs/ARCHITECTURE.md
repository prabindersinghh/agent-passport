# Architecture

Agent Passport **v0.2.0** — system as built and released 2026-08-26.

> **The agent requests. The Passport decides. The gateway enforces. OpenTelemetry records.**

See also: [Field Reference](FIELD_REFERENCE.md) · [MCP](MCP.md) · [HTTP Gateway](HTTP_GATEWAY.md) · [Runtime Integration](RUNTIME_INTEGRATION.md)

---

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
| Python SDK | Python ≥ 3.10, PyYAML — **native policy engine** (no CLI subprocess) |

---

## Packages

| Package | Path | Role |
|---------|------|------|
| `@agent-passport/core` | `packages/core` | Policy engine, gateway, audit, approval, discovery, summary, `security.ts`, memory |
| `@agent-passport/adapters` | `packages/adapters` | FS, GitHub (mock + live), MCP adapter, tests, deploy |
| `@agent-passport/mcp-proxy` | `packages/mcp-proxy` | Standalone stdio MCP JSON-RPC proxy |
| `@agent-passport/http` | `packages/http` | HTTP Gateway API |
| `@agent-passport/telemetry` | `packages/telemetry` | OTel span helpers |
| `@agent-passport/cli` | `packages/cli` | Developer CLI |
| `agent-passport-sdk` | `sdk/typescript` | TypeScript SDK |
| `agent-passport` (PyPI name) | `sdk/python` | Python SDK |

---

## Deployment topology (v0.2.0)

Local-first. No hosted SaaS. Three enforcement entry points:

<div align="center">

<pre>
Developer machine
├── Project repo
│   └── .agent/
│       ├── project.yaml
│       ├── policy.yaml
│       ├── agents/*/passport.yaml
│       ├── mcp-proxy.json      (optional MCP config)
│       ├── audit.jsonl         (append-only, local)
│       ├── approvals.db        (local SQLite)
│       └── runs/&lt;id&gt;/         (summaries per run)
│
├── In-process: CLI / TS SDK / Python SDK → Gateway
├── MCP: agent-passport-mcp (stdio proxy)
└── HTTP: agent-passport-http (default :8787)
</pre>

</div>

---

## Authorization flow

<div align="center">

<pre>
Agent / runtime → ToolRequest
              → PassportGateway.authorize()
              → PolicyEngine.evaluatePolicy()
              → AuditStore.emit()
              → [ALLOW/APPROVED] → Adapter.execute() → audit outcome
              → [APPROVAL_REQUIRED] → ApprovalManager → blocked
              → [DENY] → blocked
</pre>

</div>

Prompts are advisory. The gateway is the enforcement boundary.

---

## Policy model

Effective authority = organization rules + project policy + passport permissions + active approvals.

| Precedence layer | Source |
|------------------|--------|
| Organization | `organization.rules` in policy |
| Project | `rules` in `.agent/policy.yaml` |
| Passport | `.agent/agents/&lt;id&gt;/passport.yaml` |
| Session | Active approval grants |

Decision precedence: **DENY > APPROVAL_REQUIRED > ALLOW**

---

## Role / permission matrix (baseline templates)

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

\* Deployer passport may say `deploy: approval`, but project rule `project:deny-production-deploy` (priority 1000) wins → **DENY**.

---

## MCP enforcement

Two layers (both evaluate policy **before** forward):

1. **`McpGatewayAdapter`** — in-process intercept in adapters package
2. **`@agent-passport/mcp-proxy`** — standalone stdio JSON-RPC proxy for Cursor/Claude MCP configs

Forbidden `tools/call` requests return JSON-RPC errors without reaching upstream.

---

## HTTP Gateway

Express server exposing:

- `POST /v1/authorize` — policy evaluation
- `POST /v1/approvals/*` — human approval lifecycle
- `GET /v1/runs/:id/summary` — machine-derived summary from audit events

See [HTTP_GATEWAY.md](HTTP_GATEWAY.md).

---

## Security hardening (v0.2)

`packages/core/src/security.ts`:

- Path normalization and traversal blocking
- Protected-path write denial (`.agent`, `.env`, `.git`)
- Fail-closed on policy errors

Approval grants with `requested_scope: once` are **consumed** after one use (no replay).

---

## OpenTelemetry spans

| Span | Attributes |
|------|------------|
| `agent.run` | run_id, project_id, trace_id |
| `agent.role_switch` | from_shell, to_shell |
| `policy.check` | action, resource, decision, rule_ids |
| `tool.call` | tool_name, adapter, action, resource |

---

## Failure modes

| Failure | Behavior |
|---------|----------|
| Policy engine error | Fail closed (throws; no execution) |
| Approval DB unavailable | Approval-required actions blocked |
| Telemetry unavailable | Run continues; spans may be missing |
| Passport / project missing | Gateway throws on load |
| MCP proxy policy error | JSON-RPC `-32003`, no forward |

---

## Invariants

| ID | Invariant | Pinning test |
|----|-----------|--------------|
| INV-01 | DENY beats APPROVAL beats ALLOW | `policy-engine.test.ts` |
| INV-02 | Organization deny overrides project allow | `integration.test.ts` |
| INV-03 | Production deploy denied by project default | `policy-engine.test.ts`, `integration.test.ts` |
| INV-04 | Merge PR requires human approval | `policy-engine.test.ts`; live: `cli demo` |
| INV-05 | Researcher cannot write source | `integration.test.ts` |
| INV-06 | Secrets paths denied | `policy-engine.test.ts` |
| INV-07 | Agent cannot self-approve | `policy-engine.test.ts`, `integration.test.ts` |
| INV-08 | MCP adapter blocks before forward | `adapters/mcp.test.ts` |
| INV-09 | Gateway evaluates before execute | `integration.test.ts`; live: `cli demo` |
| INV-10 | Audit log append-only | `security.test.ts` |
| INV-11 | Memory never grants authority | `security.test.ts` |
| INV-12 | Run summary from audit events | live: `cli demo` → `summary` |
| INV-13 | High-risk actions default deny | `policy-engine.test.ts` |

Gaps and verification status: [PROGRESS.md](PROGRESS.md).

---

## Core principle

> The agent requests. The Passport decides. The gateway enforces. OpenTelemetry records. The summary reports verified work.
