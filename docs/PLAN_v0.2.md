# PLAN v0.2 — Completion, Hardening & Release

**Status: IMPLEMENTED** (2026-08-26) — see commits after `b1f27a2`, tag `v0.2.0`  
**Approved by:** User directive — “FINAL COMPLETION, HARDENING & GITHUB RELEASE” (explicit finish-the-product order)

## Goal

Take v0.1 baseline (`b1f27a2`) to a usable open-source **v0.2.0** release with real MCP proxy, HTTP gateway, native Python policy, hardened security, runtime integration paths, and GitHub publication.

## Version choice

**v0.2.0** — not v1.0. Real enforcement + integrations land, but production SaaS/dashboard and full multi-cloud deploy remain out of scope.

## Workstreams

| ID | Work | Risk | Approach |
|----|------|------|----------|
| W1 | Wire `security.ts` into gateway + FS adapter; consume once-scoped approvals | High | Additive; fail closed on path escape |
| W2 | Standalone MCP stdio proxy package | High | JSON-RPC intercept → gateway → forward |
| W3 | HTTP Gateway (`@agent-passport/http`) | Medium | Express/Fastify; TRD endpoints |
| W4 | Real GitHub adapter (octokit) + mock mode | Medium | Env `GITHUB_TOKEN`; block before API |
| W5 | Native Python policy evaluator | Medium | Port evaluatePolicy semantics; conformance fixtures |
| W6 | Runtime configs (Cursor MCP, Claude hooks docs) | Low | Config + docs; no fake “native” claims |
| W7 | Minimal memory store (JSONL/files) | Low | Separate from authority; INV-11 test |
| W8 | Security + E2E test expansion | High | Path traversal, spoof, replay, bypass |
| W9 | Docs/README polish + changelog | Low | Match reality |
| W10 | GitHub create/push + tag v0.2.0 | Medium | `gh repo create` if no remote |

## Not in v0.2

- Hosted dashboard
- Universal trust score
- Replacing cloud IAM
- Guaranteed native Cursor plugin (ecosystem may only allow MCP config)

## Test plan

- Unit: security normalize, approval consume, Python parity
- Integration: MCP proxy round-trip with mock backend
- Security: traversal, protected paths, self-approve, spoof agentId
- Live: demo, approval E2E, HTTP curl smoke, build/test exit 0

## Open questions (recommendations locked for this release)

| Q | Recommendation |
|---|----------------|
| Publish under which GitHub org/user? | `prabindersinghh/agent-passport` (gh auth is that user) |
| Simulated vs real GitHub in demo? | Demo stays mock-safe; live mode optional via env |

## Migration / data

No destructive migrations. Approvals DB schema may add columns additively if needed.
