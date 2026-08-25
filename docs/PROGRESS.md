# Progress

Last updated: **2026-08-26** (session: working-discipline adoption)

A stranger can resume from this file. Say **GO** to continue from the "Next session" section.

---

## Current state

Agent Passport **v0.1** is a local-first npm monorepo implementing identity, policy enforcement, four agent shells, CLI, SDKs, audit, approvals, OTel, and a demo workflow. **Not a git repository yet** — no commits exist.

---

## Built and present in repo

| Area | Status | Location |
|------|--------|----------|
| Policy engine (DENY > APPROVAL > ALLOW) | ✅ Built | `packages/core/src/policy-engine.ts` |
| Gateway + audit + approval | ✅ Built | `packages/core/src/gateway.ts`, `audit.ts`, `approval.ts` |
| Four shell templates | ✅ Built | `packages/core/src/templates.ts` |
| Project discovery + init | ✅ Built | `packages/core/src/discovery.ts`, `cli/commands/init.ts` |
| Tool adapters (FS, GitHub, MCP, tests, deploy) | ✅ Built | `packages/adapters/` |
| OpenTelemetry helpers | ✅ Built | `packages/telemetry/` |
| CLI (all PRD v0.1 commands) | ✅ Built | `packages/cli/` |
| TypeScript SDK | ✅ Built | `sdk/typescript/` |
| Python SDK (types + CLI-delegating authorize) | ✅ Built | `sdk/python/` |
| Demo example app | ✅ Built | `examples/example-app/` |
| CI workflow definition | ✅ Built | `.github/workflows/ci.yml` |
| Living docs (this session) | ✅ Built | `docs/` |

---

## Verified LIVE (running system)

Verified **2026-08-26** on Windows, Node v22, cwd `d:\AgentPassport`:

| Check | Command | Result |
|-------|---------|--------|
| Full test suite | `npm test` | Exit **0** — 17 TS tests passed (core 15, adapters 2); CLI/telemetry/SDK passWithNoTests |
| Build | `npm run build` | Exit **0** — all packages compile |
| Project init | `node packages/cli/dist/cli.js init --yes` in example-app | Exit **0** — `.agent/` created |
| Demo workflow | `node packages/cli/dist/cli.js demo` in example-app | Exit **0** — merge APPROVAL_REQUIRED, production.deploy DENY, summary with trace ID |
| Python tests | `pytest sdk/python/tests -q` | Exit **0** — 3 passed (prior session) |

Demo live output (last run `run_94ea32a2`):

- Researcher/Coder/Reviewer steps: ALLOW
- Merge PR: APPROVAL_REQUIRED
- Production deploy: DENY
- Summary: machine-derived totals, OTel trace present

---

## Verified ONLY IN TESTS (not live)

| Item | Test location | Live gap |
|------|---------------|----------|
| Organization deny precedence | `integration.test.ts` | No live org policy file demo |
| MCP intercept contract | `mcp.test.ts` | No live MCP server proxy |
| GitHub adapter | Used in demo with simulated PR | No real GitHub API |
| Deployment adapter | Demo shows DENY before execute | No real cloud deploy |
| Approval grant → re-authorize APPROVED | Partial in unit tests | Live `approve` flow not re-run this session |
| Python `Passport.authorize()` via subprocess | Not run live this session | Depends on CLI on PATH |

---

## Pending (ordered)

1. **Initialize git** — user has not requested; no commits to reference yet
2. **Pin INV-10, INV-11 with tests** — audit immutability adversarial test; memory≠authority test
3. **CLI/telemetry/SDK unit tests** — currently `--passWithNoTests`
4. **Standalone MCP proxy server** — adapter contract only today
5. **HTTP Gateway API** (`POST /v1/authorize`) — in-process only
6. **Native Python policy engine** — remove CLI subprocess dependency
7. **Runtime adapters** (Cursor, Claude Code, etc.)
8. **npm publish** — package metadata exists, not published
9. **Live approval end-to-end** — request → approve → merge ALLOW in one scripted run

---

## Known gaps / honest notes

- GitHub and deployment adapters **simulate** operations; demo is real policy enforcement on simulated tools, not real GitHub/cloud.
- Python SDK `authorize()` shells out to `npx agent-passport check` — corner cut for v0.1 speed.
- `better-sqlite3` native module may fail on machines without build tools (not verified on clean Windows install).
- Root `CHANGELOG.md` duplicated summary; authoritative session log is `docs/CHANGELOG.md`.

---

## Next session (continuation note)

**State:** v0.1 complete; docs discipline adopted; repo not under git.

**On GO:**

1. Ask user if git init + first commit desired
2. Add tests for INV-10 (audit append-only) and INV-11 (memory≠authority)
3. Script live approval E2E: `request` → `approve` → `check` shows APPROVED
4. Pick one v0.2 item (recommend: MCP proxy plan — write `PLAN_MCP_PROXY.md`, wait for approval)

**Open decisions needing user input:**

- Initialize git repository? (recommended before next structural work)
- v0.2 priority: MCP proxy vs HTTP gateway vs runtime adapter?

---

## Quick commands

```bash
cd d:\AgentPassport
npm install && npm run build && npm test
cd examples\example-app
node ..\..\packages\cli\dist\cli.js init --yes
node ..\..\packages\cli\dist\cli.js demo
node ..\..\packages\cli\dist\cli.js inspect
```
