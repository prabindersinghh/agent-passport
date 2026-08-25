from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class DecisionEffect(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    APPROVAL_REQUIRED = "approval_required"
    APPROVED = "approved"
    EXPIRED = "expired"


@dataclass
class PolicyDecision:
    effect: DecisionEffect | str
    reason: str
    rule_ids: list[str]
    approval_request_id: str | None = None
    policy_source: str | None = None
    agent_id: str | None = None
    action: str | None = None
    resource: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PolicyDecision:
        return cls(
            effect=data.get("effect", "deny"),
            reason=data.get("reason", ""),
            rule_ids=data.get("ruleIds", data.get("rule_ids", [])),
            approval_request_id=data.get("approvalRequestId"),
            policy_source=data.get("policySource"),
            agent_id=data.get("agentId"),
            action=data.get("action"),
            resource=data.get("resource"),
        )

    def can_execute(self) -> bool:
        return self.effect in (DecisionEffect.ALLOW, DecisionEffect.APPROVED, "allow", "approved")

    def requires_approval(self) -> bool:
        return self.effect in (DecisionEffect.APPROVAL_REQUIRED, "approval_required")

    def is_denied(self) -> bool:
        return self.effect in (DecisionEffect.DENY, DecisionEffect.EXPIRED, "deny", "expired")
