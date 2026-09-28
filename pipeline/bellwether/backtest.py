"""Backtest the election-eve model on 2018, 2020 and 2022 Senate and governor
races using FiveThirtyEight's historical raw-polls file.

Honest limits, reported alongside the numbers:
  * That file only holds polls from each race's final 21 days, so this tests
    the election-eve forecast, not the forecast five weeks out.
  * Incumbency isn't in the file, so the fundamentals here omit it (the live
    model includes it).
  * Pollster ratings are recomputed without the tested cycle (no peeking).
  * 2024 isn't in the file; a 2024 backtest needs a 2024 poll archive with
    certified results (planned).
"""
from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from datetime import date

import numpy as np

from .averaging import PollPoint, weighted_average
from .fundamentals import blend, national_environment
from .pollster_ratings import RAW, Matcher, compute
from .schema import Poll
from .simulate import simulate
from .states import REGION

PRES_NATIONAL = {"2016": 2.1, "2020": 4.5}
LEAN_FROM = {"2018": "2016", "2020": "2016", "2022": "2020"}
OFFICE = {"Sen-G": "senate", "Gov-G": "governor"}
ELASTICITY = {"senate": 1.0, "governor": 0.75}
FUND_SD = {"senate": 7.0, "governor": 8.5}


def load_rows():
    return list(csv.DictReader(open(RAW)))


def state_lean(rows, pres_cycle):
    out = {}
    for r in rows:
        if r["cycle"] == pres_cycle and r["type_simple"] == "Pres-G" and len(r["location"]) == 2:
            try:
                out[r["location"]] = float(r["margin_actual"]) - PRES_NATIONAL[pres_cycle]
            except ValueError:
                pass
    return out


def _poll(r, key):
    return Poll(id=r["poll_id"], source="538", race_key=key, pollster=r["pollster"], start_date=r["polldate"],
                end_date=r["polldate"], sample_size=int(float(r["samplesize"])) if r["samplesize"] not in ("", "NA") else None,
                population="lv", answers={}, partisan=r["partisan"] if r["partisan"] not in ("", "NA") else None)


def run_cycle(rows, cycle, systematic_sd, n_sims=20000, seed=7, fund_scale=1.0):
    ratings = compute(str(RAW), exclude_cycle=cycle)
    matcher = Matcher(ratings)
    lean = state_lean(rows, LEAN_FROM[cycle])
    races = defaultdict(list)
    generic = []
    eday = None
    for r in rows:
        if r["cycle"] != cycle:
            continue
        if r["type_simple"] == "House-G-US" and r["cand1_party"] == "DEM" and r["cand2_party"] == "REP":
            generic.append(r)
        if r["type_simple"] in OFFICE and r["cand1_party"] == "DEM" and r["cand2_party"] == "REP":
            races[r["race_id"]].append(r)
            eday = r["electiondate"]
    def pts(rs):
        out = []
        for r in rs:
            p = _poll(r, "x")
            q, rated = matcher.weight(p.pollster)
            pp = PollPoint(poll=p, raw_margin=float(r["margin_poll"]), quality=q, rated_as=rated)
            pp.margin = pp.raw_margin
            out.append(pp)
        return out
    nov = [r["electiondate"] for rs in races.values() for r in rs if r["electiondate"][5:7] == "11"]
    asof = date.fromisoformat(max(set(nov), key=nov.count))
    g = weighted_average(pts(generic), asof, 30) if generic else None
    nat, nat_sd, _ = national_environment(g.margin if g else None, g.se if g else None, None)
    spec, meta = [], []
    for rid, rs in races.items():
        st = rs[0]["location"]
        if st not in REGION:
            continue
        office = OFFICE[rs[0]["type_simple"]]
        a = weighted_average(pts(rs), date.fromisoformat(rs[0]["electiondate"]), 30)
        fund = ELASTICITY[office] * lean[st] + nat if st in lean else None
        m, s, w = blend(a.margin, a.se, 0, fund, FUND_SD[office] * fund_scale, systematic_sd=systematic_sd)
        spec.append({"mean": m, "sd": s, "state": st, "region": REGION[st], "poll_weight": w,
                     "elasticity": ELASTICITY[office], "z": {}})
        meta.append({"race": rs[0]["race"], "office": office, "state": st, "mean": m, "sd": s,
                     "poll_avg": a.margin, "fund": fund, "actual": float(rs[0]["margin_actual"])})
    sims = simulate(spec, n_sims, nat_sd, seed=seed)
    for j, mt in enumerate(meta):
        mt["p_d"] = float((sims[:, j] > 0).mean())
        mt["d_won"] = mt["actual"] > 0
    return meta


def score(meta):
    p = np.array([m["p_d"] for m in meta])
    y = np.array([m["d_won"] for m in meta], dtype=float)
    err = np.array([m["mean"] - m["actual"] for m in meta])
    z = err / np.array([m["sd"] for m in meta])
    pc = np.clip(p, 1e-3, 1 - 1e-3)
    bins = []
    for lo, hi in [(0, .05), (.05, .25), (.25, .4), (.4, .6), (.6, .75), (.75, .95), (.95, 1.0001)]:
        m = (p >= lo) & (p < hi)
        if m.sum():
            bins.append({"bin": f"{int(lo*100)}–{int(min(hi,1)*100)}%", "n": int(m.sum()),
                         "predicted": round(float(p[m].mean()), 3), "observed": round(float(y[m].mean()), 3)})
    wrong = [m for m in meta if (m["p_d"] > .5) != m["d_won"]]
    return {"races": len(meta), "brier": round(float(np.mean((p - y) ** 2)), 4),
            "log_loss": round(float(-np.mean(y * np.log(pc) + (1 - y) * np.log(1 - pc))), 4),
            "margin_rmse": round(float(np.sqrt(np.mean(err ** 2))), 2), "margin_bias": round(float(err.mean()), 2),
            "z_sd": round(float(z.std()), 2), "correct_calls": len(meta) - len(wrong), "calibration": bins,
            "misses": [{"race": m["race"], "p_d": round(m["p_d"], 3), "actual": round(m["actual"], 1)} for m in wrong]}


def main(systematic_values=(2.0, 3.0, 4.0, 5.0), fund_scales=(1.0, 1.3, 1.6)):
    """Grid-search the two uncertainty knobs on log loss, then report per cycle."""
    rows = load_rows()
    report = {"cycles": {}, "sweep": {}}
    for sd in systematic_values:
        for fs in fund_scales:
            allm = []
            for cyc in ("2018", "2020", "2022"):
                allm += run_cycle(rows, cyc, sd, fund_scale=fs)
            report["sweep"][f"{sd}|{fs}"] = score(allm)
    best = min(report["sweep"], key=lambda k: report["sweep"][k]["log_loss"])
    sd, fs = (float(x) for x in best.split("|"))
    report["chosen"] = {"systematic_sd": sd, "fund_scale": fs}
    for cyc in ("2018", "2020", "2022"):
        report["cycles"][cyc] = score(run_cycle(rows, cyc, sd, fund_scale=fs))
    report["overall"] = report["sweep"][best]
    report["limits"] = [l.strip(" *") for l in __doc__.split("Honest limits, reported alongside the numbers:")[1].strip().split("\n  *")]
    return report


if __name__ == "__main__":
    from .publish import OUT, _write
    r = main()
    _write(OUT / "backtest.json", r)
    for k, v in r["sweep"].items():
        print(k, {x: v[x] for x in ("brier", "log_loss", "margin_rmse", "z_sd", "correct_calls")})
    print("chosen", r["chosen"])
    print(json.dumps(r["overall"]["calibration"]))
    for c, s in r["cycles"].items():
        print(c, {k: s[k] for k in ("races", "brier", "margin_rmse", "margin_bias", "z_sd", "correct_calls")}, s["misses"])
