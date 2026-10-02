"""Write the JSON snapshots the website reads (web/public/data by default).

forecast.json      headline numbers, chamber odds (all 3 versions), seat histograms,
                   tipping points, national environment, markets, changes
races.json         one compact row per race (map, tables, search)
race/<id>.json     full detail: candidates, polls with every adjustment, trend, drivers
generic.json       generic-ballot average + polls;  approval.json likewise
pollsters.json     Bellwether pollster ratings
history.json       chamber odds over time
backtest.json      calibration report
"""
from __future__ import annotations

import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import ELECTION_DATE
from .averaging import d as to_date
from .forecast import DEFAULT_VERSION, VERSION_LABELS, VERSIONS, Forecast, approval_average
from .fundamentals import poll_drift_sd

OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
MODEL_VERSION = "0.2.0"
PARTY_NAME = {"D": "Democrat", "R": "Republican", "I": "Independent", "L": "Libertarian", "G": "Green", "O": "Other"}


def _r(x, n=2):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), n)


def _write(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    os.replace(tmp, path)  # atomic: readers never see a half-written file


def race_title(r) -> str:
    if r.office == "house":
        return f"{r.state_name} {'at-large' if r.district == 0 else f'District {r.district}'}"
    return f"{r.state_name}{' (special)' if r.special else ''}"


def margin_text(m, dname, rname):
    if m is None:
        return None
    lead, amt = (dname, m) if m >= 0 else (rname, -m)
    return f"{lead} +{abs(amt):.1f}"


def driver_sentence(row, est, days):
    """One neutral, plain-English sentence on what drives the forecast."""
    pr, avg, fund = row["pr"], row.get("avg"), row.get("fund")
    if row["kind"] == "uncontested":
        return "Only one candidate is on the general-election ballot."
    if row["kind"] == "same_party":
        return f"Both finalists are {PARTY_NAME.get(pr.d_party, pr.d_party)}s, so the seat's party is settled."
    m, s, w = est
    parts = []
    if avg and avg.margin is not None:
        parts.append(f"The polling average has {margin_text(avg.margin, pr.d_name, pr.r_name)} across {avg.n_polls} "
                     f"poll{'s' if avg.n_polls != 1 else ''}")
    else:
        parts.append("There are no qualifying public polls yet, so the forecast leans on fundamentals")
    if fund is not None:
        parts.append(f"partisan lean, the national environment and incumbency point to {margin_text(fund, pr.d_name, pr.r_name)}")
    sent = "; ".join(parts) + "."
    if avg and avg.margin is not None and fund is not None:
        sent += f" Polls get {round(w * 100)}% of the weight {days} days out."
    return sent


def publish(fc: Forecast, out_dir=None, history=False, n_history_sims=8000):
    out = Path(out_dir) if out_dir else OUT
    now = datetime.now(timezone.utc)
    rows, env, res = fc.run()
    main_draws = fc.last  # history runs below overwrite fc.last; keep today's draws
    draw_idx = {r["race"].id: j for j, r in enumerate(main_draws["sim_rows"])}
    prev = None
    if (out / "forecast.json").exists():
        try:
            prev = json.loads((out / "forecast.json").read_text())
        except json.JSONDecodeError:
            prev = None

    # --- markets (comparison layer; never an input) -------------------------
    markets = []
    try:
        from .adapters.markets import KalshiChambers, PolymarketChambers
        markets = PolymarketChambers().markets() + KalshiChambers().markets()
    except Exception as e:  # a dead market feed must never block the forecast
        markets = [{"error": str(e)}]

    # --- races ---------------------------------------------------------------
    races_rows, race_ids = [], []
    for row in rows:
        r, pr = row["race"], row["pr"]
        by_v = {v: res[v]["races"][r.id] for v in VERSIONS}
        base = by_v[DEFAULT_VERSION]
        compact = {
            "id": r.id, "office": r.office, "state": r.state, "state_name": r.state_name, "district": r.district,
            "special": r.special, "title": race_title(r), "kind": row["kind"],
            "dside": {"name": pr.d_name, "party": pr.d_party}, "rside": {"name": pr.r_name, "party": pr.r_party},
            "incumbent": r.incumbent, "incumbent_party": r.incumbent_party, "open": r.open_seat, "pvi": r.pvi,
            "p": {v: _r(by_v[v]["p_dside"], 4) for v in VERSIONS},
            "rating": {v: by_v[v]["rating"] for v in VERSIONS},
            "margin": {v: _r(row["est"][v][0], 1) if row.get("est") else None for v in VERSIONS},
            "p_party": base["p_party"], "n_polls": row["avg"].n_polls if row.get("avg") else 0,
            "poll_avg": _r(row["avg"].margin, 1) if row.get("avg") else None,
            "experts": r.ratings, "rules": r.rules, "p_runoff": _r(base.get("p_runoff"), 3),
        }
        races_rows.append(compact)
        race_ids.append(r.id)
        # detail file
        detail = dict(compact)
        bios = getattr(fc, "bios", {}) or {}
        detail["candidates"] = [{**c.__dict__, **({"bio": bios[c.wiki]} if c.wiki in bios else {})} for c in r.candidates]
        detail["notes"] = r.notes
        detail["poll_close_et"] = r.poll_close_et
        detail["money"] = row.get("money")
        detail["interval"] = {"p10": _r(base["p10"], 1), "p90": _r(base["p90"], 1), "median": _r(base["median"], 1)}
        j = draw_idx.get(r.id)
        if j is not None:
            # Distribution of simulated margins, 2-point bins from -40 to +40 (tails clipped into the end bins).
            import numpy as np
            col = np.clip(main_draws["margins"][:, j], -39.99, 39.99)
            h, _ = np.histogram(col, bins=40, range=(-40, 40))
            detail["dist"] = [round(float(x), 4) for x in h / h.sum()]
        if row.get("est"):
            m, s, w = row["est"][DEFAULT_VERSION]
            detail["summary"] = driver_sentence(row, row["est"][DEFAULT_VERSION], env["days"])
            detail["model"] = {
                "poll_avg": _r(row["avg"].margin, 2), "poll_se": _r(row["avg"].se, 2), "n_eff": _r(row["avg"].n_eff, 1),
                "fundamentals": _r(row["fund"], 2), "fund_sd": _r(row["fund_sd"], 1), "experts": _r(row["expert"], 1),
                "national_env": _r(env["national"], 2), "pvi": r.pvi,
                "incumbency": row["dside_inc"] * fc.incumbency[r.office], "poll_weight": _r(w, 3),
                "incumbent_history": row.get("inc_eff"),
                "fundraising_adj": _r(row.get("money_adj"), 2),
                "mean": _r(m, 2), "sd": _r(s, 2), "drift_sd": _r(poll_drift_sd(env["days"]), 2),
            }
            pts = row["avg"].points
            detail["polls"] = [{
                "pollster": p.poll.pollster, "rated_as": p.rated_as, "grade": fc.ratings[p.rated_as]["grade"] if p.rated_as else None,
                "start": p.poll.start_date, "end": p.poll.end_date, "n": p.poll.sample_size, "pop": p.poll.population,
                "sponsors": p.poll.sponsors, "partisan": p.poll.partisan, "internal": p.poll.internal, "url": p.poll.url,
                "answers": p.poll.answers, "raw": _r(p.raw_margin, 1), "adjusted": _r(p.margin, 1),
                "house_effect": _r(-p.house_effect, 2), "pop_adj": _r(p.pop_adj, 2), "timeline_adj": _r(p.timeline_adj, 2),
                "weight": _r(p.weight, 4),
            } for p in sorted(fc.pm.race_points[r.id], key=lambda p: p.poll.end_date, reverse=True)]
            if fc.pm.race_points[r.id]:
                first = min(to_date(p.poll.end_date) for p in fc.pm.race_points[r.id])
                detail["trend"] = _series(fc, r.id, first)
        else:
            detail["summary"] = driver_sentence(row, (None, None, 0), env["days"])
        _write(out / "race" / f"{r.id}.json", detail)

    # --- national series ------------------------------------------------------
    g = env["generic"]
    gstart = min(to_date(p.poll.end_date) for p in fc.pm.generic_points) if fc.pm.generic_points else fc.today
    generic = {"average": _r(g.margin, 2), "se": _r(g.se, 2), "n_polls": g.n_polls,
               "trend": _series(fc, None, gstart),
               "polls": [{"pollster": p.poll.pollster, "end": p.poll.end_date, "n": p.poll.sample_size,
                          "pop": p.poll.population, "raw": _r(p.raw_margin, 1), "adjusted": _r(p.raw_margin + p.pop_adj - p.house_effect, 1),
                          "url": p.poll.url, "src": p.poll.source} for p in fc.pm.generic_points if to_date(p.poll.end_date) >= gstart]}
    _write(out / "generic.json", generic)
    ap = []
    term_start = date(2025, 1, 20)   # second Trump term; the feed also holds first-term polls
    t = term_start + timedelta(days=7)
    term_polls = sorted((p for p in fc.inp.approval_polls if to_date(p.end_date) >= term_start), key=lambda p: p.end_date)
    while t <= fc.today:
        a = approval_average([p for p in term_polls if to_date(p.end_date) <= t], fc.matcher, t, fc.approval_effects)
        if a.margin is not None:
            ap.append({"date": t.isoformat(), "margin": _r(a.margin, 2), "se": _r(a.se, 2)})
        t += timedelta(days=1 if (fc.today - t).days <= 90 else 3)
    appr_polls = [{"pollster": p.pollster, "end": p.end_date, "n": p.sample_size, "pop": p.population,
                   "approve": p.answers.get("Approve"), "disapprove": p.answers.get("Disapprove"), "url": p.url, "src": p.source,
                   "adjusted": _r((p.answers.get("Approve") or 0) - (p.answers.get("Disapprove") or 0) - fc.approval_effects.get(f"{p.pollster}|{(p.population or 'a').lower()}", 0.0), 1)}
                  for p in fc.inp.approval_polls if to_date(p.end_date) >= term_start]
    _write(out / "approval.json", {"net": _r(env["approval"].margin, 2), "trend": ap, "polls": appr_polls})

    # --- pollsters ------------------------------------------------------------
    used = {}
    for pts in list(fc.pm.race_points.values()) + [fc.pm.generic_points]:
        for p in pts:
            used.setdefault(p.poll.pollster, {"live_name": p.poll.pollster, "rated_as": p.rated_as, "polls_2026": 0,
                                              "house_effect": _r(fc.pm.house_effects.get(p.poll.pollster, 0.0), 2)})
            used[p.poll.pollster]["polls_2026"] += 1
    _write(out / "pollsters.json", {"ratings": sorted(fc.ratings.values(), key=lambda x: x["score"]),
                                    "active": sorted(used.values(), key=lambda x: -x["polls_2026"])})

    # --- history --------------------------------------------------------------
    hist_path = out / "history.json"
    hist = json.loads(hist_path.read_text()) if hist_path.exists() else {"points": []}
    if history:
        # Backcast: rerun the model with only the data available on each date
        # (weekly from a year before the election, daily for the last 60 days).
        pts = []
        t = HISTORY_START
        while t < fc.today:
            _, _, hr = fc.run(asof=t, n_sims=n_history_sims, versions=(DEFAULT_VERSION,))
            pts.append(_hist_point(t, hr[DEFAULT_VERSION]))
            t += timedelta(days=7 if (fc.today - t).days > 60 else 1)
        hist["points"] = pts
        hist["backcast_until"] = fc.today.isoformat()
    hist["points"] = [p for p in hist["points"] if p["date"] != fc.today.isoformat()] + [_hist_point(fc.today, res[DEFAULT_VERSION])]
    hist["points"].sort(key=lambda p: p["date"])
    _write(hist_path, hist)
    # per-race chance-of-winning over time, written into each race's detail file,
    # plus a visible note when a race swung a lot since the previous point.
    prev_pt = next((p for p in reversed(hist["points"]) if p["date"] < fc.today.isoformat()), None)
    swings = []
    for rid in race_ids:
        path = out / "race" / f"{rid}.json"
        d = json.loads(path.read_text())
        d["odds_trend"] = [{"date": p["date"], "p": p["races"][rid]} for p in hist["points"] if rid in p.get("races", {})]
        d.pop("swing", None)
        if prev_pt and rid in prev_pt.get("races", {}) and d.get("kind") == "two_party":
            a, b = prev_pt["races"][rid], d["p"][DEFAULT_VERSION]
            if abs(b - a) >= SWING_FLAG:
                new = sorted({p["pollster"] for p in d.get("polls", []) if p["end"] >= prev_pt["date"]})
                d["swing"] = {"from": a, "to": b, "since": prev_pt["date"], "new_polls": new, "n_polls": d.get("n_polls", 0)}
                swings.append({"id": rid, **d["swing"]})
        _write(path, d)


    # --- what changed ----------------------------------------------------------
    changes = _changes(prev, races_rows, fc, out) if prev else []

    # --- forecast summary ------------------------------------------------------
    summary = {
        "updated": now.isoformat(timespec="seconds"), "asof": fc.today.isoformat(), "election_date": ELECTION_DATE,
        "days_to_election": env["days"], "model_version": MODEL_VERSION, "n_sims": fc.n_sims,
        "versions": [{"id": v, "label": VERSION_LABELS[v]} for v in VERSIONS], "default_version": DEFAULT_VERSION,
        "national": {"environment": _r(env["national"], 2), "environment_sd": _r(env["national_sd"], 2),
                     "generic_avg": _r(g.margin, 2), "generic_weight": _r(env["generic_weight"], 2),
                     "approval_net": _r(env["approval"].margin, 2)},
        "chambers": {v: {k: res[v][k] for k in ("senate", "house", "governor")} for v in VERSIONS},
        "markets": markets, "changes": changes, "source_status": source_status(), "swings": swings,
        "counts": {o: sum(1 for x in races_rows if x["office"] == o) for o in ("senate", "house", "governor")},
        "house_calibration": fc.house_cal,
        "sources": [
            {"name": "VoteHub Polling API", "url": "https://votehub.com/polls/api/", "use": "2026 race, generic-ballot and approval polls"},
            {"name": "Pollsters' own releases (collected by Bellwether)", "url": "https://github.com/zakank08/bellwether/blob/main/data/config/national_polls.json", "use": "Generic-ballot and approval polls from July 2026 on that VoteHub doesn't carry; each links to its release"},
            {"name": "Wikipedia 2026 election pages (CC BY-SA 4.0)", "url": "https://en.wikipedia.org/wiki/2026_United_States_elections", "use": "Races, candidates, Cook PVI on 2026 lines, published expert ratings"},
            {"name": "FiveThirtyEight raw polls (CC BY 4.0, ABC News)", "url": "https://github.com/fivethirtyeight/data/tree/master/pollster-ratings", "use": "Historical polls for pollster ratings and the backtest"},
            {"name": "Polymarket and Kalshi public APIs", "url": "https://docs.polymarket.com", "use": "Market odds shown for comparison only"},
            {"name": "Census data via Wikipedia tables", "url": "https://en.wikipedia.org/wiki/List_of_U.S._states_and_territories_by_educational_attainment", "use": "State education, Hispanic and Black population shares (correlation factors)"},
        ],
    }
    _write(out / "forecast.json", summary)
    fc.last = main_draws
    export_whatif(fc, out)
    _write(out / "races.json", races_rows)
    _write(out / "schedule.json", poll_schedule(rows))
    up = Path(__file__).resolve().parents[2] / "data" / "config" / "upcoming.json"
    if up.exists():
        _write(out / "upcoming.json", [e for e in json.loads(up.read_text())["elections"] if e["date"] >= fc.today.isoformat()])
    try:
        from .zipmap import build as build_zipmap
        build_zipmap(out)
    except Exception as e:
        print("zip lookup skipped:", e)
    try:
        from .og import make_og
        make_og(summary, races_rows, out.parent / "og.png")
    except Exception as e:  # never block a forecast on a picture
        print("og image skipped:", e)
    return summary


HISTORY_START = date(2025, 9, 1)
SWING_FLAG = 0.15   # flag a race whose win probability moved 15+ points since the previous update


def _series(fc, race_id, first: date):
    """Polling-average series: every 3 days until 90 days ago, then daily."""
    split = fc.today - timedelta(days=90)
    out = []
    if first < split:
        out += fc.pm.series(race_id, first, split - timedelta(days=1), step=3)
    out += fc.pm.series(race_id, max(first, split), fc.today, step=1)
    return out


def _hist_point(t, r):
    return {"date": t.isoformat(),
            "races": {k: round(v["p_dside"], 3) for k, v in r["races"].items() if not v.get("fixed")},
            "senate": {k: _r(v, 4) for k, v in r["senate"]["p_control"].items()},
            "house": {k: _r(v, 4) for k, v in r["house"]["p_control"].items()},
            "senate_seats": _r(r["senate"]["mean_seats"]["D"], 2), "house_seats": _r(r["house"]["mean_seats"]["D"], 2)}


def _changes(prev, races_rows, fc, out_dir=None):
    old = {}
    try:
        old_races = json.loads(((out_dir or OUT) / "races.json").read_text())
        old = {x["id"]: x for x in old_races}
    except Exception:
        return []
    since = prev.get("updated", "")[:10]
    out = []
    for x in races_rows:
        o = old.get(x["id"])
        if not o or x["kind"] != "two_party" or o.get("kind") != "two_party":
            continue
        if (o["dside"]["name"], o["rside"]["name"]) != (x["dside"]["name"], x["rside"]["name"]):
            continue  # matchup changed (e.g. a nominee was settled); not a forecast movement
        dp = (x["p"][DEFAULT_VERSION] or 0) - (o["p"][DEFAULT_VERSION] or 0)
        if abs(dp) < 0.03:
            continue
        new_polls = [p for p in fc.pm.race_points.get(x["id"], []) if p.poll.end_date >= since]
        toward = x["dside"]["name"] if dp > 0 else x["rside"]["name"]
        if new_polls:
            who = ", ".join(sorted({p.poll.pollster for p in new_polls})[:2])
            reason = f"New polling ({who}) moved the race toward {toward}."
        else:
            reason = f"Shifts in the national environment and poll aging moved the race toward {toward}."
        out.append({"id": x["id"], "title": x["title"], "office": x["office"], "from": o["p"][DEFAULT_VERSION],
                    "to": x["p"][DEFAULT_VERSION], "reason": reason})
    return sorted(out, key=lambda c: -abs(c["to"] - c["from"]))[:25]


WHATIF_SIMS = 4000


def export_whatif(fc: Forecast, out: Path):
    """Simulation draws for the what-if builder.

    whatif.bin holds WHATIF_SIMS rows x K races of int8 margins in half-point
    units (floor(margin * 2), clipped to int8; decoded as (v + 0.5) / 2). Keeping the raw
    draws (not just odds) lets the browser condition on the reader's picks:
    if you hand Texas to Democrats, only simulations where that happened are
    kept, so correlated races (Iowa, Kansas...) move too.
    """
    import numpy as np
    last = fc.last
    rows, sim_rows, margins = last["rows"], last["sim_rows"], last["margins"]
    idx = {r["race"].id: j for j, r in enumerate(sim_rows)}
    races, cols = [], []
    for row in rows:
        r, pr = row["race"], row["pr"]
        if r.office not in ("senate", "house"):
            continue
        entry = {"id": r.id, "o": r.office[0], "st": r.state, "d": r.district, "t": race_title(r),
                 "dn": pr.d_name, "dp": pr.d_party, "rn": pr.r_name, "rp": pr.r_party}
        j = idx.get(r.id)
        med = float(np.median(margins[:, j])) if j is not None else None
        if j is not None and abs(med) < (30 if r.office == "senate" else 20):
            entry["c"] = len(cols)
            entry["el"] = 1.0
            cols.append(j)
        else:
            # Settled for practical purposes: record the winner's party.
            entry["w"] = (pr.d_party if (med is None or med > 0) else pr.r_party)
        races.append(entry)
    sub = margins[:WHATIF_SIMS, cols] if cols else np.zeros((WHATIF_SIMS, 0))
    # floor (not round) so the sign survives: m > 0  <=>  floor(2m) >= 0.
    # The browser decodes a stored value v as (v + 0.5) / 2.
    q = np.clip(np.floor(sub * 2), -128, 127).astype(np.int8)
    (out / "whatif.bin").write_bytes(q.tobytes(order="C"))
    from .forecast import HOUSE_MAJORITY, SENATE_MAJORITY, SENATE_NOT_UP
    _write(out / "whatif.json", {"n": int(q.shape[0]), "k": int(q.shape[1]), "scale": 0.5, "offset": 0.5, "races": races,
                                 "senate_not_up": SENATE_NOT_UP, "senate_majority": SENATE_MAJORITY,
                                 "house_majority": HOUSE_MAJORITY, "vp": "R", "asof": fc.today.isoformat()})


def _close_minutes(t: str) -> int | None:
    """'8:30pm' -> minutes after noon ET; '12am'/'1am' roll past midnight."""
    import re
    m = re.match(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", t.strip().lower())
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    h = h % 12 + (12 if ap == "pm" else 24)
    return (h - 12) * 60 + mi


def poll_schedule(rows) -> dict:
    """Poll-closing times (Eastern) by state, from the Senate election page's
    table. Only states with a 2026 Senate race are listed there; the rest are
    reported as not yet listed rather than guessed."""
    import re
    fb_path = Path(__file__).resolve().parents[2] / "data" / "config" / "poll_closing_fallback.json"
    fb = json.loads(fb_path.read_text()) if fb_path.exists() else {"states": {}}
    by_state: dict[str, dict] = {}
    for row in rows:
        r = row["race"]
        e = by_state.setdefault(r.state, {"state": r.state, "state_name": r.state_name, "close": None, "races": [], "close_source": None})
        if r.poll_close_et:
            e["close"] = r.poll_close_et
            e["close_source"] = "wikipedia"
    for row in rows:
        r = row["race"]
        if r.office != "house" or row["kind"] == "two_party":
            by_state[r.state]["races"].append(r.id)
    for st, t in fb.get("states", {}).items():
        if st in by_state and not by_state[st]["close"]:
            by_state[st]["close"] = t
            by_state[st]["close_source"] = "fallback"
    out = []
    for e in by_state.values():
        times = re.findall(r"\d{1,2}(?::\d{2})?\s*[ap]m", e["close"] or "")
        mins = [m for m in (_close_minutes(t) for t in times) if m is not None]
        e["first"] = min(mins) if mins else None
        e["last"] = max(mins) if mins else None
        e["times"] = times
        e["note"] = fb.get("notes", {}).get(e["state"])
        out.append(e)
    out.sort(key=lambda e: (e["first"] is None, e["first"] or 0, e["state_name"]))
    return {"source": "Wikipedia, 2026 United States Senate elections (poll-closing table)",
            "fallback_source": fb.get("source"), "fallback_url": fb.get("url"), "states": out,
            "key_dates": [
                {"date": "2026-11-03", "label": "Election Day", "note": "Polls close from 6pm to 1am Eastern."},
                {"date": "2026-12-01", "label": "Georgia runoff, if needed", "note": "Georgia requires a majority; a runoff is held four weeks after the general election."},
                {"date": "2026-12-12", "label": "Louisiana House runoffs, if needed", "note": "After the Nov. 3 all-party House primary (The Green Papers)."},
            ]}


HOST_NAMES = {"api.votehub.com": "VoteHub polls", "en.wikipedia.org": "Wikipedia (races, candidates, bios)",
              "www.wikidata.org": "Wikidata (websites)", "api.open.fec.gov": "FEC fundraising",
              "gamma-api.polymarket.com": "Polymarket", "api.elections.kalshi.com": "Kalshi"}


def source_status() -> list[dict]:
    from .http import STATUS
    out = []
    for host, st in STATUS.items():
        state = "stale" if st["stale"] else "ok"
        out.append({"source": HOST_NAMES.get(host, host), "state": state, "fresh": st["fresh"], "cached": st["cached"],
                    "stale": st["stale"], "oldest_stale_h": st["oldest_stale_h"]})
    return sorted(out, key=lambda x: (x["state"] != "stale", x["source"]))
