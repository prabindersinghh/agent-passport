# Security Policy

Agent Passport is security infrastructure. We take vulnerabilities seriously.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

Please report security issues privately to the maintainers. Do not open public issues for exploitable vulnerabilities.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix if available

## Security Principles

1. Least privilege by default
2. Fail closed for authorization failures
3. Agents cannot self-escalate
4. Policy evaluation before execution
5. No secrets in telemetry by default
6. Immutable audit trail for privileged actions

## Threat Model

Consider:
- Can the agent bypass the gateway?
- Can the agent approve its own escalation?
- Can malformed tool requests bypass policy?
- Does policy engine failure fail closed?
