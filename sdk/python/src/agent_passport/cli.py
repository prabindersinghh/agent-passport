"""Minimal CLI entry for Python SDK."""

import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description="Agent Passport Python SDK")
    parser.add_argument("--version", action="version", version="0.1.0")
    parser.parse_args()
    print("Use: from agent_passport import Passport")

if __name__ == "__main__":
    main()
