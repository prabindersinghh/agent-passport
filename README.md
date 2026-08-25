<p align="center">
  <img src="docs/assets/logo.png" alt="Agent Passport logo" width="96" />
</p>

<h1 align="center">Agent Passport</h1>

<h3 align="center">The Passport for AI Agents</h3>

<p align="center">
  Portable identity, policy enforcement, human approval, and observability for AI agents.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/prabindersinghh/agent-passport/releases/tag/v0.2.0"><img src="https://img.shields.io/badge/release-v0.2.0-green.svg" alt="Release v0.2.0" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node >= 18" />
  <img src="https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white" alt="Python 3.10+" />
  <img src="https://img.shields.io/badge/MCP-proxy-000000?logo=modelcontextprotocol&logoColor=white" alt="MCP proxy" />
  <img src="https://img.shields.io/badge/OpenTelemetry-instrumented-000000?logo=opentelemetry&logoColor=white" alt="OpenTelemetry" />
</p>

<br />

<p align="center">

> **AI agents are becoming autonomous. Give them an identity before they get permissions.**

</p>

<p align="center">

> **The model is replaceable. The authority is not.**

</p>

<br />

Agent Passport is open-source infrastructure that sits **between** an AI agent and the tools it uses. The LLM may plan. It must never be the security boundary. Every protected action is evaluated by the policy engine **before** execution.

<div align="center">

<pre>
┌─────────────────────────────────────┐
│           AGENT PASSPORT             │
│  Identity · Capabilities · Policy   │
│  Human Approval · Audit · OTel       │
└──────────────────┬──────────────────┘
                   │
                   ▼
              Policy Engine
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
        ALLOW    DENY   APPROVAL
                   │
                   ▼
           MCP / FS / Git / HTTP
                   │
                   ▼
            Audit + Run Summary
</pre>

</div>

<br />

---

<br />

## Why this exists

AI agents can now modify code, run shell commands, call APIs, invoke MCP tools, open pull requests, touch databases, and reach cloud infrastructure.

But identity and authority are usually fragmented across:

- models and runtimes
- IDEs and MCP servers
- credentials and project config
- prompt instructions that are **not enforceable**

Agent Passport gives agents a **portable authority layer** — version-controlled with your project, enforced outside the LLM.

<br />

---

<br />

## Without vs with

<div align="center">

<pre>
Without Agent Passport          With Agent Passport
──────────────────────          ───────────────────
LLM                             LLM
 ↓                               ↓
Tools                           Passport
 ↓                               ↓
Hope the prompt is obeyed       Policy Engine
                                ↓
                                ALLOW / DENY / APPROVAL
                                ↓
                                Tools
                                ↓
                                Audit + OpenTelemetry
</pre>

</div>

<p align="center"><strong>The agent requests. The Passport decides. The gateway enforces. OpenTelemetry records.</strong></p>

<br />

---

<br />

## Killer demo (60 seconds)

<p align="center">

### ⚡ The 60-Second Demo

</p>

<p align="center">

> **"Fix the authentication bug and deploy the fix."**

</p>

<br />

**What this does**

```bash
git clone https://github.com/prabindersinghh/agent-passport.git
cd agent-passport
npm install && npm run build

cd examples/example-app
node ../../packages/cli/dist/cli.js init --yes   # first time only
node ../../packages/cli/dist/cli.js demo
```

**What happens**

**Actual output from v0.2.0:**

<div align="center">

<pre>
✅ Read repository              ALLOW
✅ Modify source                ALLOW
✅ Run tests                    ALLOW
✅ Create pull request          ALLOW
✅ Review changes               ALLOW
✅ Review approved              ALLOW
🔐 Merge pull request           APPROVAL_REQUIRED
🚫 Deploy production            DENY
</pre>

</div>

Agent Passport blocked autonomous production deployment because project policy denies `production.deploy`. Merge requires human approval — the agent cannot approve itself.

<br />

---

<br />

## Four agent shells

<br />

One LLM runtime can orchestrate **scoped identities** — not four separate models:

<div align="center">

<pre>
                    ONE LLM RUNTIME
                          │
                  Agent Passport
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   Researcher           Coder            Reviewer
      READ              WRITE             REVIEW
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
                      Deployer
                    (deploy ops)
                          │
                          ▼
               Production (policy-gated)
</pre>

</div>

<br />

| Shell | Typical authority | Blocked by default |
|:------|:------------------|:-------------------|
| **Researcher** | Read repo, search, analyze | Writes, merge, deploy |
| **Coder** | Read/write source, tests, create PR | Production deploy |
| **Reviewer** | Read, test, review/comment | Mutation, deploy |
| **Deployer** | Deployment operations | Production deploy (project **DENY**) |

<br />

Role switches are audited. Permissions do **not** silently transfer between shells.

<br />

---

<br />

## Two entry modes

<br />

### Agent-first — start with an agent

**What this does**

```bash
node packages/cli/dist/cli.js agent init --name coder --role coder --global
node packages/cli/dist/cli.js agent inspect --name coder
```

**What happens**

Portable identity. **No privileges** until attached to a project policy.

<br />

### Project-first — start with a project

**What this does**

```bash
cd your-project
node /path/to/agent-passport/packages/cli/dist/cli.js init
node /path/to/agent-passport/packages/cli/dist/cli.js inspect
node /path/to/agent-passport/packages/cli/dist/cli.js policy approve
```

**What happens**

Discovers Git, language, tests, MCP, CI/CD — proposes a **safe baseline**. Human approves before activation.

<br />

<div align="center">

<pre>
Agent identity  +  Project policy  =  Effective authority
</pre>

</div>

<br />

Policy precedence: **Organization → Project → Passport → Session**
Decision precedence: **DENY > APPROVAL_REQUIRED > ALLOW**

<br />

---

<br />

## Real policy (actual schema)

**Project policy** (`.agent/policy.yaml`):

```yaml
apiVersion: agentpassport.dev/v1
kind: ProjectPolicy
metadata:
  id: example-app
  version: "1"
  activated: true
defaultDeny:
  - production.deploy
  - deployment.execute
require_approval:
  - github.merge_pr
rules:
  - id: project:deny-production-deploy
    effect: deny
    action: production.deploy
    resource: "*"
    priority: 1000
  - id: project:approval-merge-pr
    effect: approval
    action: github.merge_pr
    resource: "*"
    priority: 500
```

**Agent passport** (`.agent/agents/coder/passport.yaml`):

```yaml
apiVersion: agentpassport.dev/v1
kind: AgentPassport
metadata:
  id: coder
identity:
  owner: developer
  role: coder
capabilities:
  - filesystem.read
  - filesystem.write
  - tests.run
  - github.create_pr
permissions:
  filesystem:
    allow: ["./src/**", "./tests/**"]
    deny: ["./.env", "./secrets/**"]
  github:
    read: true
    create_pr: true
    merge_pr: approval
  production:
    deploy: false
policyRef: .agent/policy.yaml
```

<br />

---

<br />

## Machine-derived run summary

Metrics come from **audit and tool events** — not from asking the LLM what it did.

<div align="center">

<pre>
AGENT PASSPORT — RUN SUMMARY

Run: run_7d63a855
Project: example-app

researcher    Actions: 2   Allowed: 2
coder         Actions: 5   Allowed: 4   Approval required: 1
reviewer      Actions: 3   Allowed: 3
deployer      Actions: 1   Denied: 1    Blocked: production.deploy

TOTALS
  Files changed: 2
  Tests executed: 2
  Pull requests: 1
  Denied actions: 1

Trace: 9beb103aac4bb2ed1b60085914144946
</pre>

</div>

```bash
node packages/cli/dist/cli.js summary --run run_7d63a855
```

<br />

---

<br />

## MCP enforcement (real proxy)

**What this does**

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

```bash
npm run build -w @agent-passport/mcp-proxy
npx agent-passport-mcp \
  --cwd . \
  --agent coder \
  --upstream-command npx \
  --upstream-args "-y,@modelcontextprotocol/server-filesystem,."
```

**What happens**

Forbidden calls return JSON-RPC errors **without** forwarding to upstream. See [docs/MCP.md](docs/MCP.md).

**Cursor / Claude Code / Codex:** configure MCP to use the proxy — not a proprietary runtime patch. See [docs/RUNTIME_INTEGRATION.md](docs/RUNTIME_INTEGRATION.md).

<br />

---

<br />

## HTTP Gateway

**What this does**

```bash
npx agent-passport-http --cwd .
curl -s -X POST http://127.0.0.1:8787/v1/authorize \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"deployer","action":"production.deploy","resource":"*"}'
```

**What happens**

Endpoints: `/v1/authorize`, `/v1/approvals`, `/v1/runs/:id/summary`. See [docs/HTTP_GATEWAY.md](docs/HTTP_GATEWAY.md).

<br />

---

<br />

## OpenTelemetry

Instrumented spans include `agent.run`, `agent.role_switch`, `policy.check`, and `tool.call`. Every run gets a trace ID correlated with audit events.

**Why engineers care:** you can answer *who did what, under which identity and policy, with what result* — without trusting model self-reporting.

<br />

---

<br />

## Integrations

| Integration | Status |
|:------------|:-------|
| Policy engine + gateway | ✅ Real enforcement |
| MCP proxy | ✅ Stdio JSON-RPC intercept |
| HTTP Gateway | ✅ `/v1/authorize`, approvals, summaries |
| TypeScript SDK | ✅ In-process `Passport.authorize()` |
| Python SDK | ✅ Native policy engine (no CLI subprocess) |
| OpenTelemetry | ✅ Span helpers in `@agent-passport/telemetry` |
| GitHub | ✅ Mock default · optional live via `GITHUB_TOKEN` |
| Cursor | MCP configuration (proxy) |
| Claude Code | MCP / HTTP configuration |
| Codex / custom | MCP / HTTP / SDK |

<br />

---

<br />

## Why Agent Passport?

| Benefit | What you get |
|:--------|:-------------|
| **Agent portability** | Same Passport across runtimes and projects |
| **Least privilege** | Four shells with distinct authority |
| **Human approval** | Sensitive actions pause for a human — agents cannot self-approve |
| **Auditability** | Append-only audit log + OTel trace IDs |
| **Reproducibility** | Policy versioned in `.agent/` with your repo |
| **Vendor independence** | Authority layer is not owned by one LLM vendor |

<br />

---

<br />

## Security model

<div align="center">

<pre>
LLM prompt  ≠  security boundary

Policy → Gateway → Tool execution → Audit
</pre>

</div>

<br />

v0.2.0 includes:

- Path traversal blocking (`../`, absolute paths, null bytes, encoding tricks)
- Protected paths (`.agent` policy state, `.env`, `.git`)
- Once-scoped approval **consume-once** (no replay)
- MCP deny before forward
- Fail closed on policy errors

Details: [SECURITY.md](SECURITY.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

<br />

---

<br />

## Project structure

<div align="center">

<pre>
packages/
  core/          Policy engine, gateway, audit, approvals, security
  adapters/      Filesystem, GitHub, MCP, tests, deploy
  mcp-proxy/     Standalone MCP enforcement proxy
  http/          HTTP Gateway API
  telemetry/     OpenTelemetry helpers
  cli/           Developer CLI

sdk/
  typescript/    TypeScript SDK
  python/        Python SDK (native policy)

examples/
  example-app/   Four-shell demo workflow

docs/            Architecture, MCP, HTTP, runtime integration
</pre>

</div>

<br />

---

<br />

## Development

**What this does**

```bash
npm install
npm run build      # exit 0
npm test           # 37 TypeScript tests (vitest)
pytest sdk/python/tests -q   # 14 Python tests
npm run demo       # runs examples/example-app demo (after build)
```

**What happens**

**Intentionally without dedicated test files:** `@agent-passport/cli`, `@agent-passport/telemetry`, `agent-passport-sdk` use `vitest --passWithNoTests` until unit tests land — they are covered by integration/demo flows.

<br />

---

<br />

## Roadmap

**v0.2.0 (current)**

- ✅ MCP proxy with real `tools/call` interception
- ✅ HTTP Gateway
- ✅ Native Python policy engine
- ✅ Security hardening + approval consume-once
- ✅ Machine-derived run summaries + OTel spans

**Future**

- npm package publishing
- Richer runtime adapter templates
- Optional orchestrator package
- Memory evolution beyond local JSONL
- Dashboard (out of scope for v0.2)

<br />

---

<br />

## Limitations (honest)

- **npm:** not published to npm yet — clone, build, use `node packages/cli/dist/cli.js`
- **GitHub live mode:** requires `GITHUB_TOKEN` + `AGENT_PASSPORT_GITHUB_MODE=live`; demo uses mock
- **Deployment:** policy enforcement is real; cloud deploy APIs are not fully integrated
- **Cursor / Claude:** enforcement via MCP/HTTP configuration, not a built-in IDE plugin
- **Telemetry:** in-process spans; OTLP export configuration is minimal in v0.2

<br />

---

<br />

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Progress](docs/PROGRESS.md) · [Field Reference](docs/FIELD_REFERENCE.md)
- [MCP](docs/MCP.md) · [HTTP Gateway](docs/HTTP_GATEWAY.md) · [Runtime Integration](docs/RUNTIME_INTEGRATION.md)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](docs/CHANGELOG.md)

<br />

---

<br />

## License

[MIT](LICENSE) — open-source infrastructure for agent identity, authorization, approval, and observability.

<p align="center"><strong>Star this repo</strong> if you believe agents need passports before permissions.</p>
