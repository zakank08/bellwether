from datetime import date

import pytest

from bellwether.averaging import (PollPoint, PollingModel, match_candidate, poll_margin, principals,
                                  recency_weight, sample_weight, weighted_average)
from bellwether.schema import Candidate, Poll, Race


class FlatMatcher:
    def weight(self, name):
        return 1.0, None


def poll(pid, end, answers, pollster="A", n=800, pop="lv", key="senate:XX", start=None, partisan=None):
    return Poll(id=pid, source="t", race_key=key, pollster=pollster, start_date=start or end, end_date=end,
                sample_size=n, population=pop, answers=answers, partisan=partisan)


def race(cands, office="senate"):
    return Race(id="2026-sen-XX", cycle=2026, office=office, state="PA", state_name="Pennsylvania",
                candidates=[Candidate(*c) for c in cands])


def pt(margin, end="2026-09-20", **kw):
    p = PollPoint(poll=poll("x", end, {}, **kw), raw_margin=margin)
    p.margin = margin
    return p


def test_recency_half_life():
    assert recency_weight(0) == 1.0
    assert recency_weight(14) == pytest.approx(0.5)
    assert recency_weight(28) == pytest.approx(0.25)


def test_sample_weight_caps_large_samples():
    assert sample_weight(600) == pytest.approx(1.0)
    assert sample_weight(3000) == sample_weight(50000)
    assert sample_weight(None) == 1.0


def test_identical_polls_average_to_their_value():
    pts = [pt(4.0, pollster=f"P{i}") for i in range(5)]
    a = weighted_average(pts, date(2026, 9, 28))
    assert a.margin == pytest.approx(4.0)
    assert a.n_polls == 5


def test_newer_polls_count_more():
    pts = [pt(10.0, "2026-06-01", pollster="Old"), pt(0.0, "2026-09-27", pollster="New")]
    a = weighted_average(pts, date(2026, 9, 28), window_days=200)
    assert a.margin < 1.0


def test_prolific_pollster_is_downweighted():
    many = [pt(10.0, pollster="Spam") for _ in range(9)]
    one = [pt(0.0, pollster="Other")]
    a = weighted_average(many + one, date(2026, 9, 28))
    # without the frequency penalty the average would be 9.0
    assert a.margin == pytest.approx(7.5, abs=0.01)


def test_partisan_sponsor_halved():
    a = weighted_average([pt(10.0, pollster="A", partisan="D"), pt(0.0, pollster="B")], date(2026, 9, 28))
    assert a.margin == pytest.approx(10 / 3, abs=0.01)


def test_future_polls_excluded():
    a = weighted_average([pt(5.0, "2026-10-01")], date(2026, 9, 28))
    assert a.margin is None


def test_principals_and_margin_sign():
    r = race([("Alice Smith", "D", "Democratic"), ("Bob Jones", "R", "Republican", True)])
    ps = [poll("1", "2026-09-20", {"Alice Smith": 48, "Bob Jones": 45})]
    pr = principals(r, ps)
    assert (pr.d_name, pr.r_name, pr.kind) == ("Alice Smith", "Bob Jones", "two_party")
    assert poll_margin(ps[0], pr) == 3


def test_same_name_goes_to_incumbent():
    cands = [Candidate("Dan J. Sullivan", "R", "Republican"), Candidate("Dan S. Sullivan", "R", "Republican", True)]
    assert match_candidate("Dan Sullivan", cands).name == "Dan S. Sullivan"


def test_top_two_same_party_is_settled():
    r = race([("A One", "D", "Democratic"), ("B Two", "D", "Democratic")])
    assert principals(r, []).kind == "same_party"


def test_independent_becomes_non_republican_principal():
    r = race([("Pete Ricketts", "R", "Republican", True), ("Dan Osborn", "I", "Independent"),
              ("Chuck Conboy", "O", "Legal Marijuana Now")])
    pr = principals(r, [])
    assert pr.d_name == "Dan Osborn" and pr.d_party == "I"


def test_party_field_when_many_candidates():
    r = race([("R One", "R", "Republican"), ("R Two", "R", "Republican"), ("D One", "D", "Democratic")], office="house")
    pr = principals(r, [])
    assert pr.r_name == "Republican field" and pr.kind == "two_party"


def test_house_effect_removed():
    pm = PollingModel(FlatMatcher(), date(2026, 9, 28))
    polls = []
    for i in range(12):
        day = f"2026-09-{10 + i:02d}"
        polls.append(poll(f"a{i}", day, {"Dem": 50, "Rep": 44}, pollster="Leans D", key="generic"))  # +6
        polls.append(poll(f"b{i}", day, {"Dem": 47, "Rep": 45}, pollster="Neutral1", key="generic"))  # +2
        polls.append(poll(f"c{i}", day, {"Dem": 47, "Rep": 45}, pollster="Neutral2", key="generic"))  # +2
    pm.add_generic(polls)
    pm.estimate_population_shift()
    pm.estimate_house_effects()
    assert pm.house_effects["Leans D"] > 2.0
    assert pm.house_effects["Neutral1"] < 0


def test_rv_polls_shifted_toward_lv():
    pm = PollingModel(FlatMatcher(), date(2026, 9, 28))
    ps = []
    for i in range(30):
        day = f"2026-09-{1 + (i % 25):02d}"
        ps.append(poll(f"l{i}", day, {"Dem": 49, "Rep": 44}, pollster=f"L{i}", pop="lv", key="generic"))
        ps.append(poll(f"r{i}", day, {"Dem": 47, "Rep": 45}, pollster=f"R{i}", pop="rv", key="generic"))
    pm.add_generic(ps)
    pm.estimate_population_shift()
    assert pm.pop_shift["rv"] > 1.0
