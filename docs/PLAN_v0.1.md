# PLAN v0.1 — Agent Passport Initial Implementation

**Status: IMPLEMENTED** (2026-08-26)  
**Note:** Plan written retroactively after implementation, per Working Discipline adoption. Serves as record of what was built and why.

---

## Goal

Deliver PRD/TRD v0.1: portable agent identity, enforceable policy, four shells, CLI, SDKs, audit, approvals, OTel, machine-derived summaries, demo workflow.

## Scope

### In scope

- Policy engine with DENY > APPROVAL > ALLOW
- Gateway enforcement before tool execution
- `.agent/` YAML config + SQLite approvals + JSONL audit
- Four shell templates
- Project discovery + `init` / agent-first `agent init`
- Adapters: FS, GitHub (simulated), MCP intercept, tests, deploy
- CLI commands per PRD §12
- TS SDK in-process; Python SDK v0.1
- Demo: auth bug fix workflow with blocked deploy + approval-gated merge

### Out of scope

- Standalone MCP proxy server
- HTTP Gateway API
- Runtime hooks for Cursor/Claude
- Dashboard
- Real GitHub/cloud API integration

## Architecture (approved by implementation)

Monorepo: `packages/core`, `adapters`, `telemetry`, `cli`; `sdk/typescript`, `sdk/python`.

## Risks accepted

| Risk | Mitigation |
|------|------------|
| Simulated adapters | Policy enforcement real; integration tests + live demo |
| Python subprocess SDK | Documented in DECISIONS; native engine v0.2 |
| Native sqlite dep | Documented; CI uses ubuntu |

## Test plan (executed)

- [x] Policy unit tests (10)
- [x] Integration + security tests (5)
- [x] MCP adapter tests (2)
- [x] Python type tests (3)
- [x] Live demo workflow
- [ ] INV-10 adversarial audit test — **not done**
- [ ] INV-11 memory≠authority test — **not done**

## Open questions at time of build

| Question | Resolution |
|----------|------------|
| TS vs Rust core? | TypeScript (DECISIONS.md) |
| Where store approvals? | SQLite (DECISIONS.md) |

## Commit pointers

Repository not under git — no commit SHAs. File tree at `d:\AgentPassport` as of 2026-08-26.

## Post-implementation follow-ups

See `docs/PROGRESS.md` pending list.
