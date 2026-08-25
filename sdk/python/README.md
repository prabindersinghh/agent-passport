# Agent Passport Python SDK

```python
from agent_passport import Passport

passport = Passport.load("coder", cwd="/path/to/project")
decision = passport.authorize("github.merge_pr", "repo/example/pr/184")

if decision.requires_approval():
    print("Human approval required:", decision.reason)
elif decision.can_execute():
    print("Allowed")
else:
    print("Denied:", decision.reason)
```

Install:

```bash
pip install -e "./sdk/python[dev]"
pytest sdk/python/tests
```
