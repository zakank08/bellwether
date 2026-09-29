from bellwether.candidate_history import incumbent_effect


def test_collins_overperformance_is_capped_and_halved():
    e = incumbent_effect("ME", "Susan Collins", "R")
    assert e["cycle"] == "2020"
    assert e["over"] < -15          # ran far ahead of Maine's Democratic lean
    assert abs(e["carry"] - e["over"] * 0.5) < 0.05  # "over" is rounded for display


def test_cap_applies():
    e = incumbent_effect("VT", "Phil Scott", "R")
    assert e["carry"] == -10.0


def test_unknown_candidate_returns_none():
    assert incumbent_effect("ME", "Nobody Here", "D") is None
