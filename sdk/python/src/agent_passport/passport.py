from __future__ import annotations

from pathlib import Path
from typing import Any

from agent_passport.loader import (
    find_project_root,
    load_agent_context,
    load_passport,
)
from agent_passport.policy_engine import EvaluationContext, evaluate_policy
from agent_passport.types import PolicyDecision


class Passport:
    """Python SDK for Agent Passport identity and native policy evaluation."""

    def __init__(self, agent_id: str, cwd: str | Path | None = None):
        self.agent_id = agent_id
        self.cwd = Path(cwd or Path.cwd())

    @classmethod
    def load(cls, path: str | Path, cwd: str | Path | None = None) -> Passport:
        p = Path(path)
        if p.is_file():
            data = load_passport(p)
            agent_id = data["metadata"]["id"]
            project_cwd = Path(cwd) if cwd is not None else find_project_root(p)
            return cls(agent_id, project_cwd)
        if cwd is not None:
            return cls(str(path), cwd)
        return cls(str(path), Path.cwd())

    def authorize(self, action: str, resource: str = "*", **kwargs: Any) -> PolicyDecision:
        agent_id = kwargs.get("agent_id", self.agent_id)
        try:
            passport, project_policy = load_agent_context(agent_id, self.cwd)
        except (FileNotFoundError, ValueError, KeyError, OSError) as exc:
            return PolicyDecision(
                effect="deny",
                reason=f"Authorization check failed: {exc}",
                rule_ids=["sdk-error"],
                agent_id=agent_id,
                action=action,
                resource=resource,
            )

        ctx = EvaluationContext(
            passport=passport,
            project_policy=project_policy,
            session_constraints=list(kwargs.get("session_constraints") or []),
            approvals=list(kwargs.get("approvals") or []),
            now=kwargs.get("now"),
        )
        return evaluate_policy({"action": action, "resource": resource}, ctx)
