# Decisions

Locked decisions with date and one-line reason. Do not relitigate without explicit user approval.

| Date | Decision | Reason |
|------|----------|--------|
| 2026-08-26 | TypeScript monorepo as primary implementation | PRD/TRD target Node CLI + TS SDK; fastest path to enforcement layer |
| 2026-08-26 | YAML on disk for passport/policy | TRD v0.1 recommendation; version-control friendly |
| 2026-08-26 | SQLite for approval state | TRD v0.1 recommendation; local-first, queryable |
| 2026-08-26 | Append-only JSONL for audit | TRD immutable audit; simple export; no update API exposed |
| 2026-08-26 | Policy precedence DENY > APPROVAL > ALLOW | TRD §5; non-negotiable security semantics |
| 2026-08-26 | Organization rules beat project and passport | TRD §6; higher-order deny not overridable |
| 2026-08-26 | Gateway evaluates before every adapter execute | PRD enforcement model; prompts are not security boundary |
| 2026-08-26 | Four shells: researcher, coder, reviewer, deployer | PRD §8; templates in `templates.ts` |
| 2026-08-26 | Production deploy denied at project level by default | PRD safe baseline; rule priority 1000 |
| 2026-08-26 | Merge PR approval-gated at project level | PRD/TRD; human authority for merge |
| 2026-08-26 | GitHub/deploy adapters simulate execution v0.1 | Real API integration deferred; policy enforcement is real |
| 2026-08-26 | MCP enforcement via adapter intercept, not standalone proxy | v0.1 scope; **superseded v0.2** by `@agent-passport/mcp-proxy` |
| 2026-08-26 | Python SDK delegates authorize to CLI subprocess | v0.1 speed; **superseded v0.2** by native Python policy engine |
| 2026-08-26 | `better-sqlite3` for approvals | Embedded local store; requires native build |
| 2026-08-26 | No git repo initialized at build time | User did not request; commits N/A until init |
| 2026-08-26 | Living docs live in `/docs` | Project Working Discipline rule 1 |
| 2026-08-26 | Structural changes require PLAN + user approval | Project Working Discipline rule 3 |
| 2026-08-26 | Release as v0.2.0 not v1.0 | Real MCP/HTTP/security land; dashboard/cloud not complete |
| 2026-08-26 | MCP enforcement via stdio JSON-RPC proxy | Practical Cursor/Claude compatibility |
| 2026-08-26 | GitHub mock default; live via env token | Safe CI; credentials never in repo |
| 2026-08-26 | Native Python policy (no subprocess) | Proper SDK; conformance fixtures |
| 2026-08-26 | Once-scoped approvals expire after use | Prevent approval replay |
| 2026-08-26 | Run summaries from audit events only | PRD §11; LLM narrative optional, never authoritative |
| 2026-08-26 | README diagrams use `<div align="center"><pre>` | GitHub does not center fenced code inside `<p>` tags |
| 2026-08-26 | Publish under prabindersinghh/agent-passport | Matches authenticated gh account |

## Rejected / out of scope v0.1

| Item | Reason |
|------|--------|
| LLM prompt as security boundary | PRD non-goal |
| Hosted dashboard | PRD v0.5 |
| Universal trust score | PRD non-goal |
| Destructive migrations | Discipline rule 4 — N/A yet (no production DB migrations) |
