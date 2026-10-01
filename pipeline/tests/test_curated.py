from bellwether.adapters import curated
from bellwether.schema import Poll


def _p(pollster, end, key="generic", src="VoteHub"):
    return Poll(id=f"{src}:{pollster}:{end}", source=src, race_key=key, pollster=pollster, start_date=end, end_date=end,
                sample_size=1000, population="rv", answers={"Dem": 45, "Rep": 40})


def test_merge_skips_polls_the_feed_already_has():
    feed = [_p("CNN/SSRS", "2026-09-17"), _p("Marist College", "2026-09-15")]
    extra = [_p("CNN/SSRS", "2026-09-17", src="curated"), _p("Marist College", "2026-09-16", src="curated"),
             _p("Emerson College", "2026-09-22", src="curated"), _p("Marist College", "2026-09-15", key="approval:trump", src="curated")]
    merged, n = curated.merge(feed, extra)
    assert n == 2   # Emerson (new) and Marist approval (different question); both same-day duplicates dropped
    assert {p.pollster for p in merged if p.source == "curated"} == {"Emerson College", "Marist College"}


def test_pollster_names_normalize():
    assert curated._norm("CNN/SSRS") == curated._norm("SSRS")
    assert curated._norm("Marist College") == curated._norm("Marist University")
    assert curated._norm("Quinnipiac University") == curated._norm("Quinnipiac")
    assert curated._norm("YouGov") != curated._norm("Ipsos")


def test_every_curated_poll_is_complete_and_sourced():
    polls = curated.load()
    assert polls, "data/config/national_polls.json should not be empty"
    for p in polls:
        assert p.url and p.url.startswith("https://"), p
        assert p.start_date <= p.end_date
        assert p.population in ("lv", "rv", "a")
        vals = list(p.answers.values())
        assert len(vals) == 2 and all(0 < v < 100 for v in vals) and sum(vals) <= 101, p


def _ap(pollster, end, approve, disapprove, pop="rv"):
    return Poll(id=f"{pollster}:{end}", source="t", race_key="approval:trump", pollster=pollster, start_date=end, end_date=end,
                sample_size=1000, population=pop, answers={"Approve": approve, "Disapprove": disapprove})


def test_approval_house_effects_find_a_consistently_mild_pollster():
    from datetime import date, timedelta
    from bellwether.forecast import approval_house_effects
    polls = []
    for i in range(20):
        end = (date(2026, 8, 1) + timedelta(days=i)).isoformat()
        polls += [_ap("A", end, 38, 60), _ap("B", end, 37, 61), _ap("C", end, 38, 60), _ap("Mild", end, 46, 52)]
    eff = approval_house_effects(polls)
    assert eff["Mild|rv"] > 5            # runs ~+8 net above peers, shrunk a little
    assert eff["Mild|rv"] > 2 * abs(eff["A|rv"])   # the outlier stands out from the ordinary pollsters
    assert eff["A|rv"] < 0 and eff["B|rv"] < 0     # and the others sit slightly below the field that includes it
