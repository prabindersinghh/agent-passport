from agent_passport.types import PolicyDecision, DecisionEffect


def test_policy_decision_can_execute():
    d = PolicyDecision(effect=DecisionEffect.ALLOW, reason="ok", rule_ids=[])
    assert d.can_execute()


def test_policy_decision_requires_approval():
    d = PolicyDecision(effect=DecisionEffect.APPROVAL_REQUIRED, reason="needs human", rule_ids=["r1"])
    assert d.requires_approval()
    assert not d.can_execute()


def test_policy_decision_denied():
    d = PolicyDecision(effect=DecisionEffect.DENY, reason="blocked", rule_ids=["deny"])
    assert d.is_denied()
