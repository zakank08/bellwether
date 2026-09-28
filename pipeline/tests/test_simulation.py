import numpy as np
import pytest

from bellwether.forecast import rating_bucket
from bellwether.fundamentals import (blend, expert_consensus, national_environment, race_fundamentals,
                                     rating_to_margin)
from bellwether.simulate import simulate


def spec(mean, sd, state="PA", region="northeast", w=0.5):
    return {"mean": mean, "sd": sd, "state": state, "region": region, "poll_weight": w, "elasticity": 1.0, "z": {}}


def test_win_probability_matches_normal_when_no_shared_error():
    m = simulate([spec(3.0, 6.0)], 200_000, national_sd=0.0, poll_miss_sd=0, region_sd=0, state_sd=0, factor_sd=0)
    from math import erf, sqrt
    expected = 0.5 * (1 + erf(3 / (6 * sqrt(2))))
    assert (m[:, 0] > 0).mean() == pytest.approx(expected, abs=0.005)


def test_total_sd_is_respected():
    m = simulate([spec(0.0, 7.0, "OH", "midwest")], 100_000, national_sd=3.0)
    assert m[:, 0].std() == pytest.approx(7.0, rel=0.05)


def test_shared_error_correlates_races():
    races = [spec(0, 6, "PA", "northeast"), spec(0, 6, "AZ", "west")]
    m = simulate(races, 50_000, national_sd=4.0)
    assert np.corrcoef(m[:, 0], m[:, 1])[0, 1] > 0.3
    ind = simulate(races, 50_000, national_sd=0.0, poll_miss_sd=0, region_sd=0, state_sd=0, factor_sd=0)
    assert abs(np.corrcoef(ind[:, 0], ind[:, 1])[0, 1]) < 0.02


def test_same_state_races_more_correlated_than_cross_region():
    races = [spec(0, 6, "PA", "northeast"), spec(0, 6, "PA", "northeast"), spec(0, 6, "TX", "south")]
    m = simulate(races, 50_000, national_sd=2.0)
    c = np.corrcoef(m.T)
    assert c[0, 1] > c[0, 2]


def test_seeded_runs_are_reproducible():
    a = simulate([spec(1, 5)], 1000, 2.0, seed=1)
    b = simulate([spec(1, 5)], 1000, 2.0, seed=1)
    assert np.array_equal(a, b)


def test_fat_tails_from_t_distribution():
    m = simulate([spec(0, 5.0, w=1.0)], 400_000, national_sd=4.0, poll_miss_sd=2.0,
                 region_sd=0, state_sd=0, factor_sd=0)
    z = m[:, 0] / m[:, 0].std()
    assert (np.abs(z) > 3).mean() > 0.0027  # more than a normal distribution would give


def test_blend_moves_toward_polls_as_election_nears():
    far = blend(4.0, 1.0, 120, -4.0, 7.0)[2]
    near = blend(4.0, 1.0, 1, -4.0, 7.0)[2]
    assert near > far


def test_blend_without_polls_is_fundamentals():
    m, s, w = blend(None, None, 30, -6.0, 7.0)
    assert (m, s, w) == pytest.approx((-6.0, 7.0, 0.0))


def test_pvi_doubles_to_margin():
    m, _ = race_fundamentals("senate", -5.0, 2.0, 0)
    assert m == pytest.approx(-8.0)
    m, _ = race_fundamentals("senate", -5.0, 2.0, -1)
    assert m == pytest.approx(-11.0)


def test_rating_mapping():
    assert rating_to_margin("Safe R") == -22
    assert rating_to_margin("Lean D (flip)") == 5
    assert rating_to_margin("Tossup") == 0
    assert expert_consensus({"a": "Lean D", "b": "Tossup"}) == 2.5


def test_national_environment_is_between_polls_and_prior():
    m, sd, w = national_environment(6.0, 1.0, -20.0, "R")
    assert 6.0 <= m <= 11.0 and 0.5 < w < 1.0


def test_rating_buckets_symmetric():
    assert rating_bucket(0.97, "D", "R") == "d-safe"
    assert rating_bucket(0.03, "D", "R") == "r-safe"
    assert rating_bucket(0.55, "D", "R") == "tossup"
    assert rating_bucket(0.8, "I", "R") == "i-likely"
