"""Load Agent Passport YAML artifacts from a project's .agent/ directory."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

AGENT_DIR = ".agent"
AGENTS_DIR = "agents"


def find_project_root(start: str | Path) -> Path:
    """Walk upward from start until a directory containing `.agent/` is found."""
    path = Path(start).resolve()
    cur = path if path.is_dir() else path.parent
    for candidate in [cur, *cur.parents]:
        if (candidate / AGENT_DIR).is_dir():
            return candidate
    return cur


def agent_root(cwd: str | Path) -> Path:
    return Path(cwd) / AGENT_DIR


def project_policy_path(cwd: str | Path) -> Path:
    return agent_root(cwd) / "policy.yaml"


def agent_passport_path(agent_id: str, cwd: str | Path) -> Path:
    return agent_root(cwd) / AGENTS_DIR / agent_id / "passport.yaml"


def load_yaml_file(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"File not found: {p}")
    with open(p, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Expected mapping in YAML file: {p}")
    return data


def load_passport(path: str | Path) -> dict[str, Any]:
    """Load and return an AgentPassport document from a YAML file."""
    return load_yaml_file(path)


def load_project_policy(cwd: str | Path) -> dict[str, Any]:
    """Load ProjectPolicy from `<cwd>/.agent/policy.yaml`."""
    return load_yaml_file(project_policy_path(cwd))


def load_agent_context(
    agent_id: str,
    cwd: str | Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Load passport + project policy for an agent id under cwd."""
    root = Path(cwd)
    passport = load_passport(agent_passport_path(agent_id, root))
    policy = load_project_policy(root)
    return passport, policy
