"""Bellwether pollster ratings.

Computed from FiveThirtyEight's historical raw-polls file (polls taken in the
final 21 days of races 1998–2022, with certified results; CC BY 4.0, ABC News).

For every poll we compute its absolute error on the margin, then compare it
with the other pollsters' polls of the *same race* ("plus-minus"). That
removes race difficulty (a volatile primary is harder than a safe Senate seat).
A pollster's score is its mean plus-minus, shrunk toward zero by how much
evidence exists (k = 10 phantom average polls), so a pollster with 4 lucky
polls can't top the table. Transparency (538's 0–10 disclosure score) nudges
the final grade. Scores are in margin points: negative = more accurate than
peers.
"""
from __future__ import annotations

import csv
import math
import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

RAW = Path(__file__).resolve().parents[2] / "data" / "history" / "raw_polls.csv"
SHRINK_K = 10.0
GRADES = [(-1.2, "A+"), (-0.8, "A"), (-0.4, "A−"), (-0.1, "B+"), (0.2, "B"), (0.5, "B−"), (0.9, "C+"),
          (1.3, "C"), (float("inf"), "D")]
STOP = {"the", "of", "inc", "llc", "and", "&", "polling", "poll", "research", "group", "survey", "center",
        "institute", "for", "public", "policy", "opinion", "strategies", "associates", "co", "company"}
ALIASES = {"siena university": "siena college", "new york times siena university": "new york times siena college"}


def norm(name: str) -> str:
    n = name.lower().replace(".", "").replace(",", " ")
    n = re.sub(r"[^a-z0-9/ ]", " ", n)
    n = " ".join(n.split())
    for a, b in ALIASES.items():
        n = n.replace(a, b)
    return n


def tokens(name: str) -> frozenset:
    return frozenset(t for t in re.split(r"[ /]+", norm(name)) if t and t not in STOP)


def grade_for(score: float) -> str:
    for cut, g in GRADES:
        if score <= cut:
            return g
    return "D"


def weight_for(score: float | None) -> float:
    """Quality multiplier used in polling averages. Unrated = 0.8."""
    if score is None:
        return 0.8
    return max(0.35, min(1.4, 1.0 - 0.3 * score))


@lru_cache(maxsize=8)
def compute(path: str = str(RAW), exclude_cycle: str | None = None) -> dict:
    """exclude_cycle lets the backtest rate pollsters without peeking at the
    cycle it is testing."""
    rows = [r for r in csv.DictReader(open(path)) if r["cycle"] != exclude_cycle]
    by_race = defaultdict(list)
    for r in rows:
        try:
            err = abs(float(r["margin_poll"]) - float(r["margin_actual"]))
            signed = float(r["margin_poll"]) - float(r["margin_actual"])  # + = overstated D (cand1 is D in general elections)
        except ValueError:
            continue
        by_race[r["race_id"]].append((r, err, signed))
    stats = defaultdict(lambda: {"pm": 0.0, "n": 0, "bias": 0.0, "nb": 0, "transp": [], "races": set(),
                                 "cycles": set(), "aapor": False, "methods": set(), "partisan": 0})
    for race, polls in by_race.items():
        if len(polls) < 2:
            continue
        tot = sum(e for _, e, _ in polls)
        for r, e, s in polls:
            others = (tot - e) / (len(polls) - 1)
            st = stats[r["pollster"]]
            st["pm"] += e - others
            st["n"] += 1
            if r["cand1_party"] == "DEM" and r["cand2_party"] == "REP":
                st["bias"] += s
                st["nb"] += 1
            if r["transparency_score"] not in ("", "NA"):
                st["transp"].append(float(r["transparency_score"]))
            st["races"].add(race)
            st["cycles"].add(r["cycle"])
            st["aapor"] |= r["aapor_roper"] == "TRUE"
            if r["methodology"] not in ("", "NA"):
                st["methods"].add(r["methodology"])
            if r["partisan"] not in ("", "NA"):
                st["partisan"] += 1
    out = {}
    for name, st in stats.items():
        raw = st["pm"] / st["n"]
        shrunk = st["pm"] / (st["n"] + SHRINK_K)
        transp = sum(st["transp"]) / len(st["transp"]) if st["transp"] else None
        score = shrunk - (0.05 * (transp - 5.0) if transp is not None else 0.0) - (0.1 if st["aapor"] else 0.0)
        out[name] = {
            "pollster": name, "polls": st["n"], "races": len(st["races"]),
            "cycles": sorted(st["cycles"]), "plus_minus_raw": round(raw, 2), "plus_minus_adj": round(shrunk, 2),
            "bias": round(st["bias"] / st["nb"], 2) if st["nb"] >= 5 else None,
            "transparency": round(transp, 1) if transp is not None else None, "aapor_roper": st["aapor"],
            "methods": sorted(st["methods"]), "partisan_share": round(st["partisan"] / st["n"], 2),
            "score": round(score, 2), "grade": grade_for(score), "weight": round(weight_for(score), 2),
            "provisional": st["n"] < 10,
        }
    return out


class Matcher:
    """Match live pollster names (VoteHub spellings) to rated pollsters."""

    def __init__(self, ratings: dict):
        self.ratings = ratings
        self.by_norm = {norm(k): k for k in ratings}
        self.by_tokens = [(tokens(k), k) for k in ratings]
        self.cache: dict[str, str | None] = {}

    def match(self, name: str) -> str | None:
        if name in self.cache:
            return self.cache[name]
        res = self.by_norm.get(norm(name))
        if not res:
            t = tokens(name)
            best, best_j = None, 0.0
            for tk, k in self.by_tokens:
                if not tk or not t:
                    continue
                j = len(t & tk) / len(t | tk)
                if j > best_j:
                    best, best_j = k, j
            if best_j >= 0.6:
                res = best
        if not res and "/" in name:  # sponsor/pollster pairs: rate by the fieldwork firm (last part)
            for part in reversed(name.split("/")):
                res = self.match(part.strip())
                if res:
                    break
        self.cache[name] = res
        return res

    def weight(self, name: str) -> tuple[float, str | None]:
        m = self.match(name)
        if not m:
            return weight_for(None), None
        return self.ratings[m]["weight"], m
