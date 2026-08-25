# Runtime Integration

Agent Passport enforces authority **outside** the LLM. Runtimes connect through the MCP proxy and/or HTTP gateway.

## Architecture for coding agents

```text
Cursor / Claude Code / Codex / Custom
              |
              | MCP tools/call  (or HTTP /v1/authorize)
              v
     Agent Passport MCP Proxy  OR  HTTP Gateway
              |
              v
         Policy Engine
              |
        ALLOW / DENY / APPROVAL
              |
              v
      Upstream MCP / Tools
```

## Cursor

1. Initialize Agent Passport in your project:

```bash
npx agent-passport init --yes
```

2. Add MCP proxy config to Cursor (`.cursor/mcp.json` or Cursor Settings → MCP):

```json
{
  "mcpServers": {
    "agent-passport-fs": {
      "command": "npx",
      "args": [
        "agent-passport-mcp",
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
npx agent-passport check filesystem.write --agent researcher --resource ./src/x.ts
# expect DENY
```

Point Cursor MCP tools through `agent-passport-mcp` so every `tools/call` is authorized first.

## Claude Code

Claude Code can use MCP servers similarly. Configure the MCP proxy as the tool server:

```bash
# Example: wrap filesystem MCP
npx agent-passport-mcp \
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

## Codex / custom agents

1. Prefer **HTTP Gateway** for language-agnostic enforcement:

```bash
npx agent-passport-http --cwd .
# POST http://127.0.0.1:8787/v1/authorize
```

2. Or import the SDK and call `authorize()` before every tool invocation.

3. Same Passport YAML works across runtimes — change the runtime, keep `.agent/`.

## Verification checklist

| Check | Expected |
|-------|----------|
| Researcher write | DENY |
| Coder write `./src/**` | ALLOW |
| Merge PR | APPROVAL_REQUIRED until human grants |
| Production deploy | DENY (project default) |
| MCP tool without allow | DENY / blocked before upstream |

## What is NOT claimed

There is no proprietary Cursor/Claude binary patch in this repo. Enforcement is via **MCP proxy**, **HTTP gateway**, and **SDK hooks**. If a runtime bypasses MCP and calls tools directly, Passport cannot intercept — configure the runtime to only use Passport-gated MCP/HTTP.
