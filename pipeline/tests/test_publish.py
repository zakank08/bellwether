from datetime import datetime, timedelta, timezone
from email.utils import format_datetime

from bellwether import fundamentals, http
from bellwether.publish import poll_schedule
from bellwether.schema import Race


def _row(rid, office, state, kind="two_party", close=None, district=None):
    r = Race(id=rid, cycle=2026, office=office, state=state, state_name=state, district=district, poll_close_et=close)
    return {"race": r, "kind": kind}


def test_poll_schedule_lists_each_states_own_races():
    rows = [_row("2026-sen-GA", "senate", "GA", close="7pm"), _row("2026-house-GA-01", "house", "GA", district=1, close="7pm"),
            _row("2026-house-GA-02", "house", "GA", "uncontested", district=2, close="7pm"),
            _row("2026-sen-TX", "senate", "TX", close="8pm"), _row("2026-sen-WY", "senate", "WY", close="9pm")]
    by = {e["state"]: e for e in poll_schedule(rows)["states"]}
    assert by["GA"]["races"] == ["2026-sen-GA", "2026-house-GA-01"]   # uncontested House seat is left out
    assert by["TX"]["races"] == ["2026-sen-TX"]
    assert by["WY"]["races"] == ["2026-sen-WY"]


def test_retry_after_accepts_seconds_dates_and_junk():
    assert http._retry_after("7", 20) == 7
    assert http._retry_after(None, 20) == 20
    assert http._retry_after("soon", 20) == 20
    assert http._retry_after("100000", 20) == 120   # capped
    soon = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=30), usegmt=True)
    assert 20 <= http._retry_after(soon, 20) <= 31


def test_fundamentals_uses_per_run_incumbency_without_touching_defaults():
    base = fundamentals.INCUMBENCY["house"]
    m, sd = fundamentals.race_fundamentals("house", 0.0, 0.0, 1, incumbency={**fundamentals.INCUMBENCY, "house": 4.0},
                                           fund_sd={**fundamentals.FUND_SD, "house": 5.0})
    assert (m, sd) == (4.0, 5.0)
    assert fundamentals.INCUMBENCY["house"] == base
