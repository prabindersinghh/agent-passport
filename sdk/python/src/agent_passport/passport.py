from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from agent_passport.types import PolicyDecision


class Passport:
    """Python SDK wrapping the Agent Passport CLI policy engine."""

    def __init__(self, agent_id: str, cwd: str | Path | None = None):
        self.agent_id = agent_id
        self.cwd = Path(cwd or Path.cwd())

    @classmethod
    def load(cls, path: str | Path, cwd: str | Path | None = None) -> Passport:
        p = Path(path)
        if p.is_file():
            import yaml

            with open(p, encoding="utf-8") as f:
                data = yaml.safe_load(f)
            agent_id = data["metadata"]["id"]
            return cls(agent_id, cwd or p.parent.parent.parent)
        return cls(str(path), cwd)

    def authorize(self, action: str, resource: str = "*", **kwargs: Any) -> PolicyDecision:
        cmd = [
            "npx",
            "agent-passport",
            "check",
            action,
            "--agent",
            kwargs.get("agent_id", self.agent_id),
            "--resource",
            resource,
            "--json",
        ]
        try:
            result = subprocess.run(
                cmd,
                cwd=self.cwd,
                capture_output=True,
                text=True,
                check=True,
                shell=True,
            )
            data = json.loads(result.stdout)
            return PolicyDecision.from_dict(data)
        except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
            return PolicyDecision(
                effect="deny",
                reason=f"Authorization check failed: {exc}",
                rule_ids=["sdk-error"],
            )
