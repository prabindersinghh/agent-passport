# Changelog

Session-dated log. Authoritative copy lives here (`docs/CHANGELOG.md`). See also root `CHANGELOG.md` for release summary.

---

## 2026-08-26 — Session: Working discipline adoption

**Shipped (no git commits — repo not initialized):**

- Created living documentation:
  - `docs/ARCHITECTURE.md` — expanded with stack, topology, role matrix, invariants + test pins
  - `docs/PROGRESS.md` — current state, live vs test verification, continuation note
  - `docs/FIELD_REFERENCE.md` — all models and fields
  - `docs/DECISIONS.md` — locked decisions
  - `docs/PLAN_v0.1.md` — retroactive plan marked IMPLEMENTED
  - `docs/CHANGELOG.md` — this file

**Verified LIVE this session:**

- `npm test` → exit 0 (17 TS tests + passWithNoTests workspaces)
- `npm run build` → exit 0
- `node packages/cli/dist/cli.js demo` in `examples/example-app` → exit 0; merge APPROVAL_REQUIRED; production.deploy DENY; summary + trace ID emitted

**Verified ONLY IN TESTS:**

- Organization deny precedence, MCP intercept, policy unit cases (see `docs/ARCHITECTURE.md` invariant table)

**Pending:**

- Git init + first commit (awaiting user)
- Tests for INV-10, INV-11
- v0.2 structural work requires PLAN + approval

---

## 2026-08-26 — Session: Initial v0.1 build

**Shipped:**

- Full Agent Passport v0.1 monorepo (core, adapters, telemetry, CLI, TS/Python SDKs)
- Example app + demo workflow
- CI workflow definition
- Root README, LICENSE, CONTRIBUTING, SECURITY

**Verified LIVE (prior session):**

- `init --yes`, `inspect`, `demo`, `check` commands
- Python SDK tests: 3 passed

**Known corners cut (disclosed):**

- Simulated GitHub/deployment adapters
- Python SDK subprocess delegation
- CLI/telemetry/SDK packages use `--passWithNoTests`

---

## Release 0.1.0 — 2026-08-26

Initial release. See root `CHANGELOG.md` for feature list.
