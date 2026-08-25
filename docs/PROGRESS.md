# Progress

Last updated: **2026-08-26** (session: v0.2 completion & release)

---

## Current state

**v0.2.0** — MCP proxy, HTTP gateway, security hardening, native Python policy, runtime docs. Git initialized; release push pending/completed this session.

Baseline commit: `b1f27a2`  
Release: `v0.2.0`

---

## Built

| Area | Status |
|------|--------|
| Core policy + gateway | ✅ |
| Security normalize + protected paths | ✅ |
| Approval once-consume | ✅ |
| Memory (no authority) | ✅ |
| MCP proxy package | ✅ |
| HTTP gateway package | ✅ |
| GitHub mock + live | ✅ |
| Native Python policy | ✅ |
| Runtime integration docs | ✅ |
| Security tests | ✅ |

---

## Verified LIVE

| Check | Result |
|-------|--------|
| `npm run build` | exit 0 |
| `npm test` | exit 0 — 37 TS tests |
| `pytest sdk/python/tests` | exit 0 — 14 tests |
| `cli demo` | merge APPROVAL_REQUIRED, deploy DENY |

---

## Verified ONLY IN TESTS

| Item | Location |
|------|----------|
| Path traversal / protected paths | `security.test.ts` |
| Approval consume-once | `security.test.ts` |
| MCP proxy deny/allow | `mcp-proxy/proxy.test.ts` |
| HTTP authorize DENY | `http/server.test.ts` |
| Python conformance | `sdk/python/tests` |

---

## Remaining limitations (honest)

1. Live GitHub requires `GITHUB_TOKEN` — demo uses mock by default
2. No proprietary Cursor binary patch — enforcement via MCP/HTTP config
3. Deployment adapter does not call cloud APIs (policy still real)
4. Telemetry/CLI packages still thin on dedicated unit tests

---

## Next (post-release)

1. npm publish packages
2. Optional: OTLP exporter config examples
3. Optional: richer orchestrator controller package
