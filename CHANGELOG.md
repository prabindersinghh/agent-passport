# Changelog

**Authoritative session log:** [docs/CHANGELOG.md](docs/CHANGELOG.md)

## 0.1.0 — 2026-08-26

Initial release.

### Added

- Core policy engine with DENY > APPROVAL > ALLOW precedence
- Passport and project policy YAML schemas
- Four agent shell templates (researcher, coder, reviewer, deployer)
- Gateway with audit logging and approval manager
- Tool adapters: filesystem, GitHub, MCP, tests, deployment
- OpenTelemetry integration
- Machine-derived run summary engine
- CLI: init, agent init, inspect, check, request, approve, run, demo, summary
- TypeScript and Python SDKs
- Demo workflow: auth bug fix with blocked deploy and approval-gated merge
- Unit, integration, and security tests
- Living documentation in `/docs`
