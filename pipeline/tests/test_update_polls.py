import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import update_national_polls as u  # noqa: E402


def test_dates_from_handles_the_formats_pollsters_use():
    assert u.dates_from("Field Dates: September 17-21, 2026") == ("2026-09-17", "2026-09-21")
    assert u.dates_from("conducted July 29 to August 3, 2026") == ("2026-07-29", "2026-08-03")
    assert u.dates_from("Interview dates: August 14-17, 2026") == ("2026-08-14", "2026-08-17")
    assert u.dates_from("collected the data from Sept. 16–21, 2026") == ("2026-09-16", "2026-09-21")
    assert u.dates_from("no dates here") is None


def _r(**kw):
    base = dict(pollster="Test Poll", sponsors=[], start="2026-09-10", end=(date.today() - timedelta(days=2)).isoformat(),
                n=1000, pop="rv", question="approval", a=40, b=58, url="https://example.com/x")
    base.update(kw)
    return u.row(base["pollster"], base["sponsors"], base["start"], base["end"], base["n"], base["pop"], base["question"], base["a"], base["b"], base["url"])


def test_a_normal_poll_passes_every_check():
    assert u.problems(_r(), []) == []


def test_bad_numbers_are_caught_not_added():
    assert u.problems(_r(a=40, b=30), [])                       # approve + disapprove far below 100
    assert u.problems(_r(a=0, b=60), [])                        # zero is a failed read, not a poll
    assert u.problems(_r(question="generic", a=30, b=20), [])
    assert u.problems(_r(url="http://insecure"), [])
    assert u.problems(_r(end=(date.today() + timedelta(days=3)).isoformat()), [])   # a poll from the future


def test_a_wild_jump_from_the_pollsters_last_poll_goes_to_a_person():
    last = _r(end="2026-09-01", a=38, b=60)
    last = {k: v for k, v in last.items()}
    why = u.problems(_r(a=60, b=38), [last])
    assert why and "moved" in why[0]
    assert u.problems(_r(a=39, b=59), [last]) == []


def test_known_polls_are_recognised_across_naming_differences():
    have = [_r(pollster="Quinnipiac University", end="2026-09-06", pop="rv")]
    assert u.is_known(_r(pollster="Quinnipiac", end="2026-09-06", pop="rv"), have)
    assert u.is_known(_r(pollster="Quinnipiac", end="2026-09-07", pop="rv"), have)       # one day apart: same poll
    assert not u.is_known(_r(pollster="Quinnipiac", end="2026-09-20", pop="rv"), have)
    assert not u.is_known(_r(pollster="Quinnipiac", end="2026-09-06", pop="a"), have)    # different population
    assert not u.is_known(_r(pollster="Quinnipiac", end="2026-09-06", question="generic", a=49, b=38), have)
