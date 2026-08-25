"""Unit tests for the native Python policy engine."""

from __future__ import annotations

from copy import deepcopy

from agent_passport.policy_engine import EvaluationContext, evaluate_policy
from agent_passport.types import DecisionEffect

from helpers import CODER, DEPLOYER, RESEARCHER, baseline_policy, make_ctx


def test_deny_production_deploy_for_coder():
    decision = evaluate_policy(
        {"action": "production.deploy", "resource": "production/main"},
        make_ctx(CODER),
    )
    assert decision.is_denied()
    assert decision.effect in (DecisionEffect.DENY, "deny")


def test_approval_merge_requires_human_then_approved():
    pending = evaluate_policy(
        {"action": "github.merge_pr", "resource": "repo/example/pr/1"},
        make_ctx(CODER),
    )
    assert pending.requires_approval()

    approved = evaluate_policy(
        {"action": "github.merge_pr", "resource": "repo/example/pr/1"},
        make_ctx(
            CODER,
            approvals=[
                {
                    "request_id": "apr-1",
                    "agent_id": "coder",
                    "shell_id": "coder",
                    "action": "github.merge_pr",
                    "resource": "*",
                    "reason": "test",
                    "requested_scope": "once",
                    "status": "granted",
                    "created_at": "2026-01-01T00:00:00Z",
                }
            ],
        ),
    )
    assert approved.effect in (DecisionEffect.APPROVED, "approved")
    assert approved.can_execute()
    assert approved.approval_request_id == "apr-1"


def test_researcher_write_deny():
    decision = evaluate_policy(
        {"action": "filesystem.write", "resource": "./src/auth.ts"},
        make_ctx(RESEARCHER),
    )
    assert decision.is_denied()


def test_org_deny_overrides_project_allow():
    policy = baseline_policy("test")
    policy["rules"].append(
        {
            "effect": "allow",
            "action": "production.deploy",
            "resource": "*",
            "id": "project:allow-deploy",
        }
    )
    policy["organization"] = {
        "rules": [
            {
                "effect": "deny",
                "action": "production.deploy",
                "resource": "*",
                "id": "org:deny-deploy",
                "priority": 2000,
            }
        ]
    }
    passport = deepcopy(DEPLOYER)
    passport["permissions"] = {
        **passport["permissions"],
        "production": {"read": True, "deploy": True},
    }
    decision = evaluate_policy(
        {"action": "production.deploy", "resource": "*"},
        EvaluationContext(passport=passport, project_policy=policy, approvals=[]),
    )
    assert decision.effect in (DecisionEffect.DENY, "deny")


def test_researcher_filesystem_read_allowed():
    decision = evaluate_policy(
        {"action": "filesystem.read", "resource": "./src/auth.ts"},
        make_ctx(RESEARCHER),
    )
    assert decision.can_execute()
