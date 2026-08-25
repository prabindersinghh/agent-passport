"""Conformance tests driven by JSON fixtures."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest

from agent_passport.policy_engine import EvaluationContext, evaluate_policy

from helpers import PASSPORTS, baseline_policy

FIXTURES = Path(__file__).parent / "fixtures" / "conformance.json"


def _load_cases() -> list[dict[str, Any]]:
    with open(FIXTURES, encoding="utf-8") as f:
        return json.load(f)


@pytest.mark.parametrize("case", _load_cases(), ids=lambda c: c["id"])
def test_conformance_case(case: dict[str, Any]):
    passport = deepcopy(PASSPORTS[case["role"]])
    policy = baseline_policy()

    if case.get("org_deny_deploy"):
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
        passport["permissions"] = {
            **passport["permissions"],
            "production": {"read": True, "deploy": True},
        }

    ctx = EvaluationContext(
        passport=passport,
        project_policy=policy,
        approvals=list(case.get("approvals") or []),
    )
    decision = evaluate_policy(
        {"action": case["action"], "resource": case.get("resource", "*")},
        ctx,
    )
    effect = decision.effect.value if hasattr(decision.effect, "value") else decision.effect
    assert effect == case["expected_effect"], (
        f"{case['id']}: expected {case['expected_effect']}, got {effect} ({decision.reason})"
    )
