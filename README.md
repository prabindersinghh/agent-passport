# The Passport for AI Agents

> **AI agents are becoming autonomous. Give them an identity before they get permissions.**

> **The model is replaceable. The authority is not.**

Agent Passport is an open-source identity, authorization, policy-enforcement, orchestration, and observability layer for AI agents.

```text
Agent  →  Passport  →  Policy Engine  →  MCP / Tools  →  Real Execution
                                              ↓
                                      OTel + Audit + Summary
```

The LLM may plan. It must never be the security boundary. Every protected tool call is evaluated by the gateway **before** execution.

## 2-minute demo

```bash
git clone https://github.com/prabindersinghh/agent-passport.git
cd agent-passport
npm install && npm run build

cd examples/example-app
node ../../packages/cli/dist/cli.js init --yes
node ../../packages/cli/dist/cli.js demo
```

Expected:

```text
Read repository        ✅ ALLOW
Modify source          ✅ ALLOW
Run tests              ✅ ALLOW
Create PR              ✅ ALLOW
Review                 ✅ ALLOW
Merge PR               🔐 APPROVAL_REQUIRED
Deploy production      🚫 DENY
```

## Install

```bash
npm install
npm run build
npm test
```

CLI (after build):

```bash
node packages/cli/dist/cli.js --help
# or: npx agent-passport
```

## Two entry flows

**Project-first:** `agent-passport init` — discover project, propose safe policy, create four shells.

**Agent-first:** `agent-passport agent init --name coder --global` — portable identity, no privileges until attached to a project.

## Four shells

| Shell | Authority | Blocked |
|-------|-----------|---------|
| Researcher | Read, search | Writes, merge, deploy |
| Coder | Source R/W, tests, create PR | Production deploy |
| Reviewer | Read, tests, review | Mutation, deploy |
| Deployer | Deploy ops | Production deploy (project DENY by default) |

## Real integrations

| Integration | How |
|-------------|-----|
| **MCP** | `npx agent-passport-mcp` — stdio proxy intercepts `tools/call` before upstream |
| **HTTP** | `npx agent-passport-http` — `POST /v1/authorize`, approvals, summaries |
| **Cursor / Claude / Codex** | Point MCP at the proxy; see [docs/RUNTIME_INTEGRATION.md](docs/RUNTIME_INTEGRATION.md) |
| **GitHub** | Mock (default) or live via `GITHUB_TOKEN` + `AGENT_PASSPORT_GITHUB_MODE=live` |
| **TypeScript SDK** | `Passport.load('coder').authorize({...})` |
| **Python SDK** | Native policy engine (no CLI subprocess) |

## Policy precedence

```text
Organization DENY  >  Project  >  Passport  >  Session
DENY  >  APPROVAL_REQUIRED  >  ALLOW
```

Fail closed when policy evaluation is unavailable for protected actions.

## Packages

| Package | Role |
|---------|------|
| `@agent-passport/core` | Policy, gateway, audit, approvals, security, memory |
| `@agent-passport/adapters` | FS, GitHub, MCP, tests, deploy |
| `@agent-passport/mcp-proxy` | Real MCP interception |
| `@agent-passport/http` | HTTP Gateway API |
| `@agent-passport/telemetry` | OpenTelemetry |
| `@agent-passport/cli` | Developer CLI |
| `agent-passport-sdk` | TypeScript SDK |
| `agent-passport` (PyPI) | Python SDK |

## Docs

- [Architecture](docs/ARCHITECTURE.md) · [Progress](docs/PROGRESS.md) · [Decisions](docs/DECISIONS.md)
- [MCP](docs/MCP.md) · [HTTP Gateway](docs/HTTP_GATEWAY.md) · [Runtime Integration](docs/RUNTIME_INTEGRATION.md)
- [Field Reference](docs/FIELD_REFERENCE.md) · [Security](SECURITY.md)

## License

MIT
