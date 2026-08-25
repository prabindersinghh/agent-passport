# Contributing to Agent Passport

Thank you for your interest in contributing!

## Development Setup

```bash
git clone <repo>
cd agent-passport
npm install
npm run build
npm test
```

## Code Standards

- TypeScript strict mode for core packages
- Policy evaluation must remain deterministic and testable
- Never treat LLM prompts as security boundaries
- Every protected action must pass through the gateway
- Audit events must reflect real system actions only

## Pull Request Process

1. Fork and create a feature branch
2. Add tests for policy/security changes
3. Ensure `npm test` passes
4. Update documentation if CLI or schema changes

## Living documentation

Per Project Working Discipline, update `/docs` in the same session as code changes:

- **Behavior change** → `ARCHITECTURE.md`, `FIELD_REFERENCE.md`, `CHANGELOG.md`
- **Session completion** → `PROGRESS.md`
- **Locked decision** → `DECISIONS.md`

Index: [docs/README.md](docs/README.md)

## Testing Requirements

- Unit tests for policy precedence and scoping
- Integration tests for CLI + gateway + adapters
- Security tests for bypass/escalation attempts
