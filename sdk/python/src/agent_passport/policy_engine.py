"""Native policy evaluator — ports packages/core policy-engine.ts semantics."""

from __future__ import annotations

import fnmatch
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from agent_passport.types import PolicyDecision

DEFAULT_DENIED_ACTIONS = frozenset({"production.deploy", "deployment.execute"})

EFFECT_PRIORITY = {
    "deny": 300,
    "approval": 200,
    "approval_required": 200,
    "allow": 100,
}


@dataclass
class EvaluationContext:
    passport: dict[str, Any]
    project_policy: dict[str, Any]
    session_constraints: list[dict[str, Any]] = field(default_factory=list)
    approvals: list[dict[str, Any]] = field(default_factory=list)
    now: datetime | None = None


@dataclass
class _MatchedRule:
    rule: dict[str, Any]
    source: str
    priority: int


def normalize_effect(effect: str) -> str:
    if effect == "approval_required":
        return "approval"
    if effect in ("allow", "deny", "approval"):
        return effect
    return "deny"


def resource_matches(pattern: str, resource: str) -> bool:
    if pattern in ("*", "**"):
        return True
    return fnmatch.fnmatch(resource.lower(), pattern.lower())


def action_matches(rule_action: str, request_action: str) -> bool:
    if rule_action == "*" or rule_action == request_action:
        return True
    if request_action.startswith(rule_action + "."):
        return True
    if rule_action.endswith(".*"):
        prefix = rule_action[:-2]
        return request_action == prefix or request_action.startswith(prefix + ".")
    return False


def _make_bool_rule(
    action: str,
    resource: str,
    value: bool | str,
    source: str,
) -> dict[str, Any]:
    if value is True:
        effect = "allow"
    elif value is False:
        effect = "deny"
    else:
        effect = "approval"
    return {
        "effect": effect,
        "action": action,
        "resource": resource,
        "source": source,
        "id": f"{source}:{action}",
        "priority": 100,
    }


def passport_rules(passport: dict[str, Any]) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    perms = passport.get("permissions")
    if not perms:
        return rules

    filesystem = perms.get("filesystem")
    if filesystem:
        for path in filesystem.get("allow") or []:
            rules.append(
                {
                    "effect": "allow",
                    "action": "filesystem.read",
                    "resource": path,
                    "source": "passport",
                    "id": f"passport:fs:read:{path}",
                    "priority": 100,
                }
            )
            rules.append(
                {
                    "effect": "allow",
                    "action": "filesystem.write",
                    "resource": path,
                    "source": "passport",
                    "id": f"passport:fs:write:{path}",
                    "priority": 100,
                }
            )
        for path in filesystem.get("deny") or []:
            rules.append(
                {
                    "effect": "deny",
                    "action": "filesystem.*",
                    "resource": path,
                    "source": "passport",
                    "id": f"passport:fs:deny:{path}",
                    "priority": 900,
                }
            )

    github = perms.get("github")
    if github:
        if github.get("read") is not None:
            rules.append(_make_bool_rule("github.read", "*", github["read"], "passport"))
        if github.get("create_pr") is not None:
            rules.append(
                _make_bool_rule("github.create_pr", "*", github["create_pr"], "passport")
            )
        if github.get("merge_pr") is not None:
            rules.append(
                _make_bool_rule("github.merge_pr", "*", github["merge_pr"], "passport")
            )

    production = perms.get("production")
    if production:
        if production.get("read") is not None:
            rules.append(
                _make_bool_rule("production.read", "*", production["read"], "passport")
            )
        if production.get("deploy") is not None:
            rules.append(
                _make_bool_rule("production.deploy", "*", production["deploy"], "passport")
            )

    tests = perms.get("tests")
    if tests is not None and tests.get("run") is not None:
        rules.append(_make_bool_rule("tests.run", "*", tests["run"], "passport"))

    repository = perms.get("repository")
    if repository is not None and repository.get("read") is not None:
        rules.append(_make_bool_rule("repository.read", "*", repository["read"], "passport"))

    search = perms.get("search")
    if search is not None and search.get("execute") is not None:
        rules.append(_make_bool_rule("search.execute", "*", search["execute"], "passport"))

    mcp = perms.get("mcp")
    if mcp:
        for tool in mcp.get("allow") or []:
            rules.append(
                {
                    "effect": "allow",
                    "action": "mcp.tool.call",
                    "resource": tool,
                    "source": "passport",
                    "id": f"passport:mcp:{tool}",
                    "priority": 100,
                }
            )
        for tool in mcp.get("deny") or []:
            rules.append(
                {
                    "effect": "deny",
                    "action": "mcp.tool.call",
                    "resource": tool,
                    "source": "passport",
                    "id": f"passport:mcp:deny:{tool}",
                    "priority": 900,
                }
            )

    return rules


def collect_rules(ctx: EvaluationContext) -> list[_MatchedRule]:
    matched: list[_MatchedRule] = []
    policy = ctx.project_policy

    org = policy.get("organization") or {}
    for rule in org.get("rules") or []:
        matched.append(
            _MatchedRule(
                rule={**rule, "source": rule.get("source") or "organization"},
                source="organization",
                priority=rule.get("priority", 1000),
            )
        )

    for rule in policy.get("rules") or []:
        matched.append(
            _MatchedRule(
                rule={**rule, "source": rule.get("source") or "project"},
                source="project",
                priority=rule.get("priority", 500),
            )
        )

    for rule in passport_rules(ctx.passport):
        matched.append(
            _MatchedRule(
                rule=rule,
                source="passport",
                priority=rule.get("priority", 300),
            )
        )

    for rule in ctx.session_constraints:
        matched.append(
            _MatchedRule(
                rule={**rule, "source": rule.get("source") or "session"},
                source="session",
                priority=rule.get("priority", 200),
            )
        )

    for action in policy.get("defaultDeny") or []:
        matched.append(
            _MatchedRule(
                rule={
                    "effect": "deny",
                    "action": action,
                    "resource": "*",
                    "source": "project-default",
                    "id": f"default-deny:{action}",
                    "priority": 400,
                },
                source="project-default",
                priority=400,
            )
        )

    return matched


def _parse_dt(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    # Support trailing Z
    text = value.replace("Z", "+00:00") if value.endswith("Z") else value
    dt = datetime.fromisoformat(text)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def find_valid_approval(
    ctx: EvaluationContext,
    action: str,
    resource: str,
) -> dict[str, Any] | None:
    now = ctx.now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    agent_id = (ctx.passport.get("metadata") or {}).get("id")
    for approval in ctx.approvals:
        if approval.get("status") != "granted":
            continue
        if approval.get("agent_id") != agent_id:
            continue
        if not action_matches(approval.get("action", ""), action):
            continue
        apr_resource = approval.get("resource", "*")
        if apr_resource != "*" and not resource_matches(apr_resource, resource):
            continue
        expires = _parse_dt(approval.get("expires_at"))
        if expires is not None and expires < now:
            continue
        return approval
    return None


def _agent_id(passport: dict[str, Any]) -> str | None:
    return (passport.get("metadata") or {}).get("id")


def evaluate_policy(
    request: dict[str, str],
    ctx: EvaluationContext,
) -> PolicyDecision:
    action = request["action"]
    resource = request.get("resource", "*")
    all_rules = collect_rules(ctx)

    applicable = [
        m
        for m in all_rules
        if action_matches(m.rule["action"], action)
        and resource_matches(m.rule.get("resource", "*"), resource)
    ]

    agent = _agent_id(ctx.passport)

    if not applicable:
        if action in DEFAULT_DENIED_ACTIONS:
            return PolicyDecision(
                effect="deny",
                reason=f"No explicit allow rule for high-risk action '{action}'",
                rule_ids=["default-deny"],
                policy_source="default",
                action=action,
                resource=resource,
                agent_id=agent,
            )
        return PolicyDecision(
            effect="deny",
            reason=f"No matching policy rule for action '{action}' on resource '{resource}'",
            rule_ids=[],
            policy_source="default",
            action=action,
            resource=resource,
            agent_id=agent,
        )

    applicable.sort(
        key=lambda m: (
            EFFECT_PRIORITY[normalize_effect(m.rule["effect"])],
            m.priority,
        ),
        reverse=True,
    )

    top_deny = next(
        (m for m in applicable if normalize_effect(m.rule["effect"]) == "deny"),
        None,
    )
    if top_deny:
        return PolicyDecision(
            effect="deny",
            reason=top_deny.rule.get("reason") or f"Denied by {top_deny.source} policy",
            rule_ids=[top_deny.rule.get("id") or f"{top_deny.source}:deny"],
            policy_source=top_deny.source,
            action=action,
            resource=resource,
            agent_id=agent,
        )

    top_approval = next(
        (m for m in applicable if normalize_effect(m.rule["effect"]) == "approval"),
        None,
    )
    if top_approval:
        approval = find_valid_approval(ctx, action, resource)
        if approval:
            return PolicyDecision(
                effect="approved",
                reason=f"Valid approval {approval['request_id']} grants this action",
                rule_ids=[top_approval.rule.get("id") or f"{top_approval.source}:approval"],
                approval_request_id=approval.get("request_id"),
                policy_source=top_approval.source,
                action=action,
                resource=resource,
                agent_id=agent,
            )
        return PolicyDecision(
            effect="approval_required",
            reason=top_approval.rule.get("reason")
            or f"Human approval required for '{action}'",
            rule_ids=[top_approval.rule.get("id") or f"{top_approval.source}:approval"],
            policy_source=top_approval.source,
            action=action,
            resource=resource,
            agent_id=agent,
        )

    top_allow = next(
        (m for m in applicable if normalize_effect(m.rule["effect"]) == "allow"),
        None,
    )
    if top_allow:
        capabilities = ctx.passport.get("capabilities") or []
        if capabilities and not any(action_matches(c, action) for c in capabilities):
            return PolicyDecision(
                effect="deny",
                reason=f"Action '{action}' not in agent capabilities",
                rule_ids=["capability-check"],
                policy_source="passport",
                action=action,
                resource=resource,
                agent_id=agent,
            )
        return PolicyDecision(
            effect="allow",
            reason=top_allow.rule.get("reason") or f"Allowed by {top_allow.source} policy",
            rule_ids=[top_allow.rule.get("id") or f"{top_allow.source}:allow"],
            policy_source=top_allow.source,
            action=action,
            resource=resource,
            agent_id=agent,
        )

    return PolicyDecision(
        effect="deny",
        reason="Default deny — no applicable allow rule",
        rule_ids=["default-deny"],
        policy_source="default",
        action=action,
        resource=resource,
        agent_id=agent,
    )
