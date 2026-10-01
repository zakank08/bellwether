from pathlib import Path

import json

from bellwether.results import alaska, enhanced_voting, worker
from bellwether.results.model import Cand, RaceResult

FX = Path(__file__).parent / "fixtures" / "results"


def test_alaska_2024_house():
    rows = alaska.parse((FX / "ak_2024.csv").read_text(), year=2024)
    (r,) = rows
    assert r.race_id == "2024-house-AK-00"
    by = {c.name: c.votes for c in r.cands}
    assert by["Nick Begich"] == 159550 and by["Mary S. Peltola"] == 152828
    assert [c.party for c in r.cands][:2] == ["R", "D"]
    assert r.units_total == 523 and r.units_reporting > 400


def test_georgia_2024():
    data = json.loads((FX / "ga_2024_ballot-items.json").read_text())
    rows = {r.race_id: r for r in enhanced_voting.parse(data, "GA", 2024)}
    assert len(rows) == 14  # the president is not a 2026 race, the 14 House seats are
    d1 = rows["2024-house-GA-01"]
    assert d1.cands[0].party == "R" and d1.units_total > 0 and "Carter" in d1.cands[0].name and "(" not in d1.cands[0].name


def rr(rid, d, r, units=5, total=10):
    return RaceResult(rid, "GA", [Cand("A", "D", d), Cand("B", "R", r)], units, total, "test")


def test_worker_keeps_last_good_when_votes_go_down():
    ok = lambda: [rr("2026-sen-GA", 100, 90)]
    bad = lambda: [rr("2026-sen-GA", 80, 95)]
    res, st = worker.run_once({"GA": ok}, None, {}, "t1")
    res2, st2 = worker.run_once({"GA": bad}, {"results": res, "status": st}, {}, "t2")
    assert res2["races"][0]["cands"][0]["votes"] == 100
    assert st2["states"]["GA"]["state"] == "stale" and "went down" in st2["states"]["GA"]["rejected"][0]["why"]


def test_worker_feed_down_marks_stale_and_keeps_numbers():
    res, st = worker.run_once({"GA": lambda: [rr("2026-sen-GA", 100, 90)]}, None, {}, "t1")

    def boom():
        raise RuntimeError("503")
    res2, st2 = worker.run_once({"GA": boom, "AK": lambda: []}, {"results": res, "status": st}, {}, "t2")
    assert st2["states"]["GA"]["state"] == "stale" and st2["states"]["GA"]["errors_in_a_row"] == 1
    assert len(res2["races"]) == 1


def test_overrides_need_reason_and_source():
    ov = {"results": [
        {"race_id": "2026-sen-GA", "cands": [{"name": "A", "party": "D", "votes": 5}], "reason": "feed down", "source": "county site"},
        {"race_id": "2026-sen-AK", "cands": [{"name": "A", "party": "D", "votes": 5}]},
    ], "holds": [{"race_id": "2026-sen-GA", "action": "undecided", "reason": "recount"}, {"race_id": "x", "action": "nope", "reason": "r"}]}
    res, st = worker.run_once({}, None, ov, "t")
    assert [r["race_id"] for r in res["races"]] == ["2026-sen-GA"]
    assert res["races"][0]["source"].startswith("Entered by hand from")
    assert len(st["override_errors"]) == 2 and "2026-sen-GA" in res["holds"]


def test_replay_runs_through_worker_and_drills():
    from bellwether.results.replay import Replay
    final = alaska.parse((FX / "ak_2024.csv").read_text(), year=2024)
    rp = Replay(final)
    prev = None
    seen = []
    for m in (30, 90, 150, 240):
        rp.at(m)
        res, st = worker.run_once({"AK": rp.read}, prev, {}, f"m{m}")
        prev = {"results": res, "status": st}
        seen.append(res["races"][0]["total"])
    assert seen == sorted(seen) and seen[-1] == final[0].total
    rp.at(240)
    rp.fault = "decrease"
    res, st = worker.run_once({"AK": rp.read}, prev, {}, "bad")
    assert st["states"]["AK"]["state"] == "stale" and res["races"][0]["total"] == final[0].total
    rp.fault = "down"
    res, st = worker.run_once({"AK": rp.read}, prev, {}, "bad2")
    assert st["states"]["AK"]["state"] == "stale"


def test_north_carolina_2024():
    from bellwether.results import north_carolina
    rows = {r.race_id: r for r in north_carolina.parse((FX / "nc_2024.tsv").read_text(), 2024)}
    r = rows["2024-house-NC-13"]
    assert [c.name for c in r.cands] == ["Brad Knott", "Frank Pierce"]
    assert r.cands[0].votes == 243655 and r.cands[1].party == "D" and r.units_total > 50
