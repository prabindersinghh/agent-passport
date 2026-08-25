# Runtime Integration

Last updated: **2026-08-26** (v0.2.0)

Agent Passport enforces authority **outside** the LLM. Runtimes connect through the MCP proxy and/or HTTP gateway.

<div align="center">

<pre>
Cursor / Claude Code / Codex / Custom
              │
              │ MCP tools/call  (or HTTP /v1/authorize)
              ▼
     Agent Passport MCP Proxy  OR  HTTP Gateway
              │
              ▼
         Policy Engine
              │
        ALLOW / DENY / APPROVAL
              │
              ▼
      Upstream MCP / Tools
</pre>

</div>

See also: [MCP.md](MCP.md) · [HTTP_GATEWAY.md](HTTP_GATEWAY.md)

---

## Cursor

1. Initialize Agent Passport in your project:

```bash
node /path/to/agent-passport/packages/cli/dist/cli.js init --yes
```

2. Add MCP proxy config to Cursor (`.cursor/mcp.json` or Cursor Settings → MCP):

```json
{
  "mcpServers": {
    "agent-passport-fs": {
      "command": "node",
      "args": [
        "/path/to/agent-passport/packages/mcp-proxy/dist/cli.js",
        "--cwd",
        "${workspaceFolder}",
        "--agent",
        "coder",
        "--upstream-command",
        "npx",
        "--upstream-args",
        "-y,@modelcontextprotocol/server-filesystem,${workspaceFolder}"
      ]
    }
  }
}
```

3. Verify enforcement:

```bash
node /path/to/agent-passport/packages/cli/dist/cli.js check filesystem.write --agent researcher --resource ./src/x.ts
# expect DENY
```

Point Cursor MCP tools through the proxy so every `tools/call` is authorized first.

---

## Claude Code

Claude Code can use MCP servers similarly. Configure the MCP proxy as the tool server:

```bash
node /path/to/agent-passport/packages/mcp-proxy/dist/cli.js \
  --cwd . \
  --agent coder \
  --upstream-command npx \
  --upstream-args "-y,@modelcontextprotocol/server-filesystem,."
```

Also use the TypeScript/Python SDK inside custom Claude Code tools:

```typescript
import { Passport } from 'agent-passport-sdk';
const p = Passport.load('coder');
const d = p.authorize({ action: 'github.merge_pr', resource: 'repo/x/pr/1' });
if (d.effect !== 'allow' && d.effect !== 'approved') throw new Error(d.reason);
```

---

## Codex / custom agents

1. Prefer **HTTP Gateway** for language-agnostic enforcement:

```bash
node /path/to/agent-passport/packages/http/dist/cli.js --cwd .
# POST http://127.0.0.1:8787/v1/authorize
```

2. Or import the SDK and call `authorize()` before every tool invocation.

3. Same Passport YAML works across runtimes — change the runtime, keep `.agent/`.

---

## Verification checklist

| Check | Expected |
|-------|----------|
| Researcher write | DENY |
| Coder write `./src/**` | ALLOW |
| Merge PR | APPROVAL_REQUIRED until human grants |
| Production deploy | DENY (project default) |
| MCP tool without allow | DENY / blocked before upstream |

---

## What is NOT claimed

There is no proprietary Cursor/Claude binary patch in this repo. Enforcement is via **MCP proxy**, **HTTP gateway**, and **SDK hooks**. If a runtime bypasses MCP and calls tools directly, Passport cannot intercept — configure the runtime to only use Passport-gated MCP/HTTP.
