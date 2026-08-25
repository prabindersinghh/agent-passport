# MCP Proxy

Last updated: **2026-08-26** (v0.2.0)

Standalone stdio JSON-RPC proxy that evaluates Agent Passport policy **before** forwarding MCP `tools/call` requests.

<div align="center">

<pre>
Coding Agent
     │
     ▼
Agent Passport MCP Proxy   ← intercepts tools/call
     │
     ▼
Policy check (ALLOW / DENY / APPROVAL)
     │
     ▼
Upstream MCP server → Tool
</pre>

</div>

See also: [Runtime Integration](RUNTIME_INTEGRATION.md) · [Architecture](ARCHITECTURE.md)

---

## Install / build

```bash
npm install
npm run build -w @agent-passport/mcp-proxy
```

---

## Run

```bash
node packages/cli/dist/cli.js   # from repo root after build — or:
npx agent-passport-mcp \
  --cwd . \
  --agent coder \
  --upstream-command npx \
  --upstream-args "-y,@modelcontextprotocol/server-filesystem,."
```

> **Note:** npm packages are not published yet. After clone + build, use `node packages/mcp-proxy/dist/cli.js` or workspace binaries from the monorepo.

---

## Config file

`.agent/mcp-proxy.json`:

```json
{
  "upstreamCommand": "npx",
  "upstreamArgs": ["-y", "@modelcontextprotocol/server-filesystem", "."],
  "serverName": "filesystem",
  "agent": "coder"
}
```

---

## Behavior

| Policy decision | Proxy behavior |
|-----------------|----------------|
| allow / approved | Forward to upstream MCP |
| deny | JSON-RPC error `-32001`, no forward |
| approval_required | JSON-RPC error `-32002`, no forward |
| policy error | Fail closed `-32003`, no forward |

Audit events are written to `.agent/audit.jsonl`.

Policy is evaluated **before** any upstream `tools/call` is forwarded.
