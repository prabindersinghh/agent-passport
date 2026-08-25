# HTTP Gateway

Last updated: **2026-08-26** (v0.2.0)

Language-agnostic policy enforcement over HTTP. See [Architecture](ARCHITECTURE.md).

<div align="center">

<pre>
HTTP client / custom agent
         │
         ▼
Agent Passport HTTP Gateway
         │
         ▼
Policy Engine → ALLOW / DENY / APPROVAL
         │
         ▼
Audit + optional summary
</pre>

</div>

---

## Run

```bash
npm run build -w @agent-passport/http
node packages/http/dist/cli.js --cwd .
# default PORT=8787
```

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/v1/authorize` | Evaluate action |
| POST | `/v1/approvals` | Create approval request |
| POST | `/v1/approvals/:id/grant` | Human grant |
| POST | `/v1/approvals/:id/deny` | Human deny |
| GET | `/v1/approvals/:id` | Get approval |
| GET | `/v1/runs/:id/summary` | Machine-derived summary |

---

## Authorize example

```bash
curl -s -X POST http://127.0.0.1:8787/v1/authorize \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"deployer","action":"production.deploy","resource":"production/main"}'
```

Response shape:

```json
{
  "decision": "DENY",
  "effect": "deny",
  "reason": "Production deployment denied by default",
  "agent": "deployer",
  "ruleIds": ["project:deny-production-deploy"],
  "policySource": "project",
  "trace_id": "..."
}
```

Summaries are derived from `.agent/audit.jsonl`, not LLM narrative.
