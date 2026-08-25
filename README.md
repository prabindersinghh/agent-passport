# Agent Passport

> **The model is replaceable. The authority is not.**

Agent Passport is an open-source identity, authorization, policy-enforcement, orchestration, and observability layer for AI agents.

It gives AI agents portable identity and **enforceable** authority — not prompt instructions, but a real policy engine between the agent and every protected tool or resource.

## Quick Start

```bash
git clone https://github.com/your-org/agent-passport.git
cd agent-passport
npm install
npm run build

# Initialize in your project
cd examples/example-app
node ../../packages/cli/dist/cli.js init --yes

# Inspect configuration
node ../../packages/cli/dist/cli.js inspect

# Run the demo workflow
node ../../packages/cli/dist/cli.js demo
```

## Two Entry Paths

### Project-first (Mode B)

```bash
agent-passport init
```

Discovers project context, generates a safe baseline policy, creates four role shells (Researcher, Coder, Reviewer, Deployer), and requires human approval before activating non-trivial authority.

### Agent-first (Mode A)

```bash
agent-passport agent init --name coder --global
agent-passport agent inspect --name coder
```

Creates a portable agent identity with **no implicit privileges**. Attach to projects to grant scoped authority.

## Architecture

```
LLM / Coding Agent
        |
        | tool/action request
        v
+-----------------------+
| Agent Passport Gateway|
| - identity resolver   |
| - policy engine       |
| - approval manager    |
| - audit emitter       |
+-----------+-----------+
            |
     ALLOW / DENY / APPROVAL
            |
            v
      Tool Adapters (FS, Git, MCP, ...)
            |
            v
      OpenTelemetry + Audit + Summary
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

**Living documentation:** [docs/PROGRESS.md](docs/PROGRESS.md) · [docs/FIELD_REFERENCE.md](docs/FIELD_REFERENCE.md) · [docs/DECISIONS.md](docs/DECISIONS.md) · [docs/CHANGELOG.md](docs/CHANGELOG.md)

## CLI Commands

| Command | Description |
|---------|-------------|
| `agent-passport init` | Initialize project (project-first) |
| `agent-passport agent init --name <id>` | Create agent identity (agent-first) |
| `agent-passport inspect` | Inspect project authority model |
| `agent-passport check <action>` | Check authorization for an action |
| `agent-passport request <action>` | Request human approval |
| `agent-passport approve <id>` | Grant pending approval |
| `agent-passport run --demo` | Run four-shell demo workflow |
| `agent-passport summary` | Machine-derived run summary |

## SDK Usage

### TypeScript

```typescript
import { Passport } from 'agent-passport-sdk';

const passport = Passport.load('coder');
const decision = passport.authorize({
  action: 'github.merge_pr',
  resource: 'repo/example/pr/184',
});

if (decision.effect === 'approval_required') {
  // Human approval required
}
```

### Python

```python
from agent_passport import Passport

passport = Passport.load(".agent/agents/coder/passport.yaml")
decision = passport.authorize("github.merge_pr", "repo/example/pr/184")
```

## Four Agent Shells

| Shell | Typical Authority | Restrictions |
|-------|-------------------|--------------|
| Researcher | Read repo, search | No writes, merge, deploy |
| Coder | Read/write source, tests, create PR | No production deploy |
| Reviewer | Read, test, review | No mutation, deploy |
| Deployer | Deployment ops | Production requires approval |

## Policy Precedence

```
Organization Policy (non-overridable denies)
      +
Project Policy
      +
Agent Passport
      +
Session Constraints
      =
Effective Authority
```

**DENY > APPROVAL_REQUIRED > ALLOW**

## Repository Structure

```
.agent/
├── project.yaml
├── policy.yaml
├── agents/
│   ├── researcher/passport.yaml
│   ├── coder/passport.yaml
│   ├── reviewer/passport.yaml
│   └── deployer/passport.yaml
├── audit.jsonl
├── approvals.db
└── runs/<run-id>/
```

## Demo Workflow

Task: *"Fix the authentication bug and deploy the fix."*

```
Read repository              ✅
Modify source                ✅
Run tests                    ✅
Create pull request          ✅
Review                       ✅
Merge pull request           🔐 HUMAN APPROVAL
Deploy production            🚫 BLOCKED
```

Run: `agent-passport demo`

## Development

```bash
npm install
npm run build
npm test
```

## Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities responsibly.

## License

MIT — see [LICENSE](LICENSE)
