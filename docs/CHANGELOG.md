# Changelog

## 0.2.0 — 2026-08-26

### Added
- Path traversal / absolute path / null-byte normalization (`security.ts`); fail-closed in gateway
- Protected-path write denial for `.agent`, `.env`, `.git`
- Once-scoped approval consumption (no replay)
- Memory store (local JSONL) — never grants authority
- `@agent-passport/mcp-proxy` — real MCP stdio JSON-RPC interception
- `@agent-passport/http` — HTTP Gateway (`/v1/authorize`, approvals, summaries)
- GitHub adapter live mode via `GITHUB_TOKEN` (mock remains default)
- Native Python policy engine (no CLI subprocess)
- Runtime integration docs (Cursor / Claude Code / Codex)
- Security tests (INV-10, INV-11, traversal, protected paths, approval consume)
- GitHub issue/PR templates

### Changed
- Version bump to 0.2.0 across packages
- Role switch loads target shell identity (permissions do not transfer)

### Verified live
- `npm run build` exit 0
- `npm test` exit 0 (37 TS tests)
- `pytest sdk/python/tests` exit 0 (14 tests)
- Demo: merge APPROVAL_REQUIRED, deploy DENY

### Final QA polish
- README landing page with logo, architecture diagrams, real demo output
- Fixed root `npm run demo` script (was pointing to missing `demo.js`)
- GitHub repo description and topics updated

### Docs sync (post-release)
- README diagrams use GitHub-compatible `<div align="center"><pre>` centering
- ARCHITECTURE.md updated from v0.1 draft to v0.2.0 (MCP proxy, HTTP gateway, security, invariants)
- MCP.md, HTTP_GATEWAY.md, RUNTIME_INTEGRATION.md expanded with centered diagrams and accurate CLI paths
- FIELD_REFERENCE.md, DECISIONS.md, CONTRIBUTING.md, examples/README.md updated
- Added docs/README.md living-doc index

---

## 0.1.0 — 2026-08-26

Initial baseline: policy engine, gateway, CLI, adapters, SDKs, demo, living docs.
