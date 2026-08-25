# Living Documentation

Last updated: **2026-08-26**

Agent Passport follows **Project Working Discipline**: docs in `/docs` stay current with the codebase. Update them in the same session as structural or release changes.

---

## Index

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, packages, invariants |
| [FIELD_REFERENCE.md](FIELD_REFERENCE.md) | Every persisted field and action name |
| [PROGRESS.md](PROGRESS.md) | Current state, verified live vs tests, gaps |
| [CHANGELOG.md](CHANGELOG.md) | Version history |
| [DECISIONS.md](DECISIONS.md) | Locked architectural decisions |
| [MCP.md](MCP.md) | MCP proxy setup and behavior |
| [HTTP_GATEWAY.md](HTTP_GATEWAY.md) | HTTP API reference |
| [RUNTIME_INTEGRATION.md](RUNTIME_INTEGRATION.md) | Cursor / Claude / Codex configuration |
| [PLAN_v0.1.md](PLAN_v0.1.md) | v0.1 implementation plan (historical) |
| [PLAN_v0.2.md](PLAN_v0.2.md) | v0.2 implementation plan (historical) |

Root-level: [README.md](../README.md) · [SECURITY.md](../SECURITY.md) · [CONTRIBUTING.md](../CONTRIBUTING.md)

---

## Discipline rules

1. **Living docs** — `/docs` reflects what is actually built, not aspirations.
2. **Session reports** — update `PROGRESS.md` at end of significant sessions.
3. **Structural work** — requires `PLAN_*.md` + user approval before large rewrites.
4. **No silent drift** — if code changes behavior, update ARCHITECTURE, FIELD_REFERENCE, and CHANGELOG in the same PR/session.

---

## Current release

**v0.2.0** — https://github.com/prabindersinghh/agent-passport/releases/tag/v0.2.0
