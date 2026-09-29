from types import SimpleNamespace

from bellwether import house_history as H


def fake_results(monkeypatch):
    monkeypatch.setattr(H, "results_2024", lambda: {
        "PA-07": {"d_name": "Susan Wild", "r_name": "Ryan Mackenzie", "margin": -1.0, "inc_side": 1},
        "WA-03": {"d_name": "Marie Gluesenkamp Perez", "r_name": "Joe Kent", "margin": 3.8, "inc_side": 1},
    })


CAL = {"intercept": 0.0, "elasticity": 1.0, "incumbency": 3.5}


def race(st, d, inc, pvi):
    return SimpleNamespace(office="house", state=st, district=d, incumbent=inc, pvi=pvi)


def test_track_record_only_for_repeat_incumbents(monkeypatch):
    fake_results(monkeypatch)
    # Mackenzie beat incumbent Wild in 2024: that race measured Wild, so no credit.
    assert H.incumbent_effect(race("PA", 7, "Ryan Mackenzie", -1), CAL) is None
    e = H.incumbent_effect(race("WA", 3, "Marie Gluesenkamp Perez", -2), CAL)
    # expected = 2*-2 + national(-2.7) + 3.5 = -3.2; over = 3.8 - (-3.2) = 7.0; carry = 3.5
    assert e["over"] == 7.0 and e["carry"] == 3.5


def test_redrawn_states_skipped(monkeypatch):
    fake_results(monkeypatch)
    assert H.incumbent_effect(race("TX", 7, "Someone", 0), CAL) is None
