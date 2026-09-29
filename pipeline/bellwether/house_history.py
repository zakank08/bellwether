"""2024 House results (Wikipedia's 2024 House elections page, CC BY-SA) used to
(1) calibrate the House fundamentals — how strongly district results follow
partisan lean, how big incumbency is, and how large the typical miss is — and
(2) credit House incumbents with their 2024 track record, like Senate and
governor incumbents.

Only states whose district lines are the same in 2026 as in 2024 are used:
in the ten states that redrew, a district number no longer means the same
place, so 2024 results there would be misleading.
"""
from __future__ import annotations

import io
import json
import re
from functools import lru_cache

import numpy as np
import pandas as pd

from .adapters.wikipedia import CAND_RE, _flat, clean
from .http import fetch
from .schema import party_code
from .states import STATES

PAGE = "https://en.wikipedia.org/w/api.php?action=parse&page=2024_United_States_House_of_Representatives_elections&prop=text&format=json&formatversion=2"
REDRAWN_SINCE_2024 = {"AL", "CA", "FL", "LA", "MO", "NC", "OH", "TN", "TX", "UT"}
NATIONAL_2024 = -2.7   # national House popular vote margin, D minus R
PCT_RE = re.compile(r"▌\s*([^▌(]+?)\s*\(([^)]+)\)\s*([\d.]+)%")
CARRY, CAP = 0.5, 10.0


@lru_cache(maxsize=1)
def results_2024() -> dict[str, dict]:
    """District key 'PA-07' -> {d_name, r_name, d_pct, r_pct, margin, winner}."""
    h = json.loads(fetch(PAGE, max_age_s=30 * 86400))["parse"]["text"]
    out: dict[str, dict] = {}
    for t in pd.read_html(io.StringIO(h)):
        t = _flat(t)
        loc = next((c for c in t.columns if c.startswith("District")), None)
        inc_col = next((c for c in t.columns if c.startswith("Incumbent") and c.endswith("Member")), None)
        cand = next((c for c in t.columns if c.startswith("Candidates") or c.endswith("Candidates")), None)
        if not loc or not cand:
            continue
        for _, r in t.iterrows():
            m = re.match(r"(.+?)\s+(\d+|at-large)$", clean(r[loc]), re.I)
            if not m or m.group(1) not in STATES:
                continue
            key = f"{STATES[m.group(1)]}-{0 if not m.group(2).isdigit() else int(m.group(2)):02d}"
            if key in out:
                continue
            by_party: dict[str, tuple[str, float]] = {}
            for name, party, pct in PCT_RE.findall(clean(r[cand])):
                p = party_code(party)
                if p in ("D", "R") and (p not in by_party or float(pct) > by_party[p][1]):
                    by_party[p] = (clean(name), float(pct))
            if "D" in by_party and "R" in by_party:
                d, rr = by_party["D"], by_party["R"]
                inc = clean(r[inc_col]) if inc_col else ""
                inc = re.split(r"\s+Redistricted from", re.sub(r"\s*\(.*?\)", "", inc))[0].strip()
                inc_side = 1 if inc and _last(inc) == _last(d[0]) else -1 if inc and _last(inc) == _last(rr[0]) else 0
                out[key] = {"d_name": d[0], "r_name": rr[0], "d_pct": d[1], "r_pct": rr[1], "margin": round(d[1] - rr[1], 2),
                            "winner": "D" if d[1] > rr[1] else "R", "incumbent_2024": inc or None, "inc_side": inc_side}
    return out


def _last(n: str) -> str:
    toks = [t for t in re.sub(r"[^a-z\- ]", " ", n.lower()).split() if t not in ("jr", "sr", "ii", "iii")]
    return toks[-1] if toks else ""


def calibrate(races) -> dict:
    """Fit margin_2024 = a + b*(2*PVI) + NATIONAL + inc*incumbent_side on
    unchanged-lines districts with a D-vs-R race in 2024."""
    res = results_2024()
    X, y, keys = [], [], []
    for r in races:
        if r.office != "house" or r.state in REDRAWN_SINCE_2024 or r.pvi is None:
            continue
        key = f"{r.state}-{r.district:02d}"
        x = res.get(key)
        if not x or abs(x["margin"]) > 60:
            continue
        X.append([1.0, 2 * r.pvi, x["inc_side"]])
        y.append(x["margin"] - NATIONAL_2024)
        keys.append(key)
    X, y = np.array(X), np.array(y)
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ coef
    return {"n": int(len(y)), "intercept": round(float(coef[0]), 2), "elasticity": round(float(coef[1]), 3),
            "incumbency": round(float(coef[2]), 2), "resid_sd": round(float(resid.std(ddof=3)), 2),
            "resid_mad_sd": round(float(1.4826 * np.median(np.abs(resid - np.median(resid)))), 2)}


def incumbent_effect(r, cal: dict) -> dict | None:
    """Half of how far the incumbent ran ahead of their district in 2024 (capped)."""
    if r.office != "house" or r.state in REDRAWN_SINCE_2024 or r.pvi is None or not r.incumbent:
        return None
    x = results_2024().get(f"{r.state}-{r.district:02d}")
    if not x or abs(x["margin"]) > 60:
        return None
    # Only for members who were already the incumbent in 2024: otherwise that
    # race mostly measured their then-opponent (e.g. a challenger who beat an incumbent).
    side = x["inc_side"]
    if not side or _last(r.incumbent) != _last(x["d_name"] if side == 1 else x["r_name"]):
        return None
    expected = cal["intercept"] + cal["elasticity"] * 2 * r.pvi + NATIONAL_2024 + cal["incumbency"] * side
    over = x["margin"] - expected
    return {"race": f"2024 {r.state}-{r.district:02d}", "cycle": "2024", "actual": round(x["margin"], 1),
            "expected": round(expected, 1), "over": round(over, 1), "carry": round(max(-CAP, min(CAP, CARRY * over)), 2)}
