# Example App — Agent Passport Demo

Minimal TypeScript app used to demonstrate the four-shell workflow.

## Quick path (from repository root)

```bash
npm install
npm run build
npm run demo
```

This runs `examples/example-app` init (if needed) and the full demo workflow.

## Run the demo manually

```bash
cd examples/example-app

# First-time setup
node ../../packages/cli/dist/cli.js init --yes

# Inspect authority model
node ../../packages/cli/dist/cli.js inspect

# Run full workflow: Research → Code → Review → Deploy
node ../../packages/cli/dist/cli.js demo
```

## Expected demo output

| Step | Result |
|------|--------|
| Read repository | ALLOW |
| Modify source | ALLOW |
| Run tests | ALLOW |
| Create pull request | ALLOW |
| Review | ALLOW |
| Merge pull request | APPROVAL_REQUIRED |
| Deploy production | DENY |

## Approval flow

```bash
# Check merge authorization
node ../../packages/cli/dist/cli.js check github.merge_pr --agent coder

# Request and grant approval
node ../../packages/cli/dist/cli.js request github.merge_pr --agent coder
node ../../packages/cli/dist/cli.js approve <request-id>
```

## View run summary

```bash
node ../../packages/cli/dist/cli.js summary --run <run-id>
```

Summaries are machine-derived from `.agent/audit.jsonl`, not LLM claims.
