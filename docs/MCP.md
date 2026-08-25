# MCP Proxy

Standalone stdio JSON-RPC proxy that evaluates Agent Passport policy **before** forwarding MCP `tools/call` requests.

## Install / build

```bash
npm install
npm run build -w @agent-passport/mcp-proxy
```

## Run

```bash
npx agent-passport-mcp \
  --cwd . \
  --agent coder \
  --upstream-command npx \
  --upstream-args "-y,@modelcontextprotocol/server-filesystem,."
```

Or `.agent/mcp-proxy.json`:

```json
{
  "upstreamCommand": "npx",
  "upstreamArgs": ["-y", "@modelcontextprotocol/server-filesystem", "."],
  "serverName": "filesystem",
  "agent": "coder"
}
```

## Behavior

| Policy decision | Proxy behavior |
|-----------------|----------------|
| allow / approved | Forward to upstream MCP |
| deny | JSON-RPC error `-32001`, no forward |
| approval_required | JSON-RPC error `-32002`, no forward |
| policy error | Fail closed `-32003`, no forward |

Audit events are written to `.agent/audit.jsonl`.
