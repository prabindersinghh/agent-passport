"""Shared passport/policy builders for Python SDK tests."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from agent_passport.policy_engine import EvaluationContext


def baseline_policy(project_id: str = "test-project") -> dict[str, Any]:
    return {
        "apiVersion": "agentpassport.dev/v1",
        "kind": "ProjectPolicy",
        "metadata": {
            "id": project_id,
            "version": "1",
            "name": project_id,
            "activated": False,
        },
        "defaultDeny": ["production.deploy", "deployment.execute"],
        "require_approval": ["github.merge_pr", "production.deploy"],
        "rules": [
            {
                "id": "project:deny-production-deploy",
                "effect": "deny",
                "action": "production.deploy",
                "resource": "*",
                "priority": 1000,
                "source": "project",
                "reason": "Production deployment denied by default",
            },
            {
                "id": "project:approval-merge-pr",
                "effect": "approval",
                "action": "github.merge_pr",
                "resource": "*",
                "priority": 500,
                "source": "project",
                "reason": "Merge requires human approval",
            },
            {
                "id": "project:allow-fs-read",
                "effect": "allow",
                "action": "filesystem.read",
                "resource": "./**",
                "priority": 100,
                "source": "project",
            },
            {
                "id": "project:allow-tests",
                "effect": "allow",
                "action": "tests.run",
                "resource": "*",
                "priority": 100,
                "source": "project",
            },
            {
                "id": "project:allow-create-pr",
                "effect": "allow",
                "action": "github.create_pr",
                "resource": "*",
                "priority": 100,
                "source": "project",
            },
            {
                "id": "project:allow-review",
                "effect": "allow",
                "action": "review.comment",
                "resource": "*",
                "priority": 100,
                "source": "project",
            },
            {
                "id": "project:deny-secrets",
                "effect": "deny",
                "action": "filesystem.*",
                "resource": "./secrets/**",
                "priority": 900,
                "source": "project",
                "reason": "Secrets directory is denied",
            },
            {
                "id": "project:deny-env",
                "effect": "deny",
                "action": "filesystem.*",
                "resource": "./.env",
                "priority": 900,
                "source": "project",
                "reason": ".env file access denied",
            },
        ],
    }


def make_passport(
    role: str,
    *,
    capabilities: list[str],
    permissions: dict[str, Any],
) -> dict[str, Any]:
    return {
        "apiVersion": "agentpassport.dev/v1",
        "kind": "AgentPassport",
        "metadata": {"id": role, "project": "test-project"},
        "identity": {
            "owner": "developer",
            "role": role,
            "name": role.title(),
            "description": f"{role} agent",
        },
        "capabilities": capabilities,
        "policyRef": ".agent/policy.yaml",
        "permissions": permissions,
    }


RESEARCHER = make_passport(
    "researcher",
    capabilities=["repository.read", "filesystem.read", "search.execute"],
    permissions={
        "repository": {"read": True},
        "filesystem": {
            "allow": ["./**"],
            "deny": ["./.env", "./secrets/**", "./.agent/**"],
        },
        "search": {"execute": True},
        "github": {"read": True, "create_pr": False, "merge_pr": False},
        "production": {"read": True, "deploy": False},
        "tests": {"run": False},
    },
)

CODER = make_passport(
    "coder",
    capabilities=[
        "repository.read",
        "filesystem.read",
        "filesystem.write",
        "tests.run",
        "github.read",
        "github.create_pr",
    ],
    permissions={
        "repository": {"read": True},
        "filesystem": {
            "allow": ["./src/**", "./tests/**", "./test/**", "./lib/**", "./app/**"],
            "deny": ["./.env", "./secrets/**"],
        },
        "tests": {"run": True},
        "github": {"read": True, "create_pr": True, "merge_pr": "approval"},
        "production": {"read": True, "deploy": False},
        "search": {"execute": True},
    },
)

DEPLOYER = make_passport(
    "deployer",
    capabilities=[
        "repository.read",
        "filesystem.read",
        "production.read",
        "deployment.request",
        "deployment.execute",
    ],
    permissions={
        "repository": {"read": True},
        "filesystem": {"allow": ["./**"], "deny": ["./.env", "./secrets/**"]},
        "production": {"read": True, "deploy": "approval"},
        "github": {"read": True, "create_pr": False, "merge_pr": "approval"},
    },
)

PASSPORTS = {
    "researcher": RESEARCHER,
    "coder": CODER,
    "deployer": DEPLOYER,
}


def make_ctx(passport: dict[str, Any], **overrides: Any) -> EvaluationContext:
    kwargs: dict[str, Any] = {
        "passport": deepcopy(passport),
        "project_policy": deepcopy(baseline_policy()),
        "approvals": [],
    }
    kwargs.update(overrides)
    return EvaluationContext(**kwargs)
