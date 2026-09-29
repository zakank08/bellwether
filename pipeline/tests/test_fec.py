from bellwether.adapters.fec import _last, match
from bellwether.fundamentals import fundraising_adjustment

RESULTS = [
    {"candidate_name": "OSSOFF, T. JONATHAN", "candidate_id": "S8GA00180", "total_receipts": 100_000_000,
     "total_disbursements": 60_000_000, "cash_on_hand_end_period": 25_000_000, "coverage_end_date": "2026-06-30T00:00:00"},
    {"candidate_name": "COLLINS, MIKE", "candidate_id": "S6GA00001", "total_receipts": 20_000_000,
     "total_disbursements": 12_000_000, "cash_on_hand_end_period": 6_000_000, "coverage_end_date": "2026-06-30T00:00:00"},
]


def test_last_name_forms():
    assert _last("OSSOFF, T. JONATHAN") == "ossoff"
    assert _last("Jon Ossoff") == "ossoff"
    assert _last("Clyde Jones Jr.") == "jones"


def test_match_by_last_name():
    m = match(RESULTS, "Jon Ossoff")
    assert m["receipts"] == 100_000_000 and m["through"] == "2026-06-30"
    assert match(RESULTS, "Someone Else") is None


def test_fundraising_adjustment_is_small_and_capped():
    assert fundraising_adjustment(2_000_000, 1_000_000) == 0.75
    assert fundraising_adjustment(100_000_000, 1_000_000) == 2.5
    assert fundraising_adjustment(1_000_000, 100_000_000) == -2.5
    assert fundraising_adjustment(10_000, 5_000_000) == 0.0   # paper candidate: ignored
    assert fundraising_adjustment(None, 5_000_000) == 0.0
