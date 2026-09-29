"""How much an incumbent ran ahead of (or behind) their state's partisanship
last time. Some incumbents (Susan Collins, Phil Scott) routinely beat their
state's lean by double digits; a partisanship-only fundamentals estimate
misses that entirely.

For the incumbent's most recent Senate or governor general election in the
historical file, overperformance = actual margin - (state partisan lean +
that year's national environment). Half of it carries into this cycle
(candidate effects persist but fade), capped at +/-10 points.
"""
from __future__ import annotations

import csv
import re
from functools import lru_cache

from .pollster_ratings import RAW

# National popular-vote margins (D minus R): presidential results in
# presidential years, national House vote in midterms.
NATIONAL = {"2000": 0.5, "2002": -4.6, "2004": -2.4, "2006": 8.0, "2008": 7.3, "2010": -6.8, "2012": 3.9,
            "2014": -5.7, "2016": 2.1, "2018": 8.6, "2020": 4.5, "2022": -2.7}
PRES_NATIONAL = {"2000": 0.5, "2004": -2.4, "2008": 7.3, "2012": 3.9, "2016": 2.1, "2020": 4.5}
CARRY = 0.5
CAP = 10.0
TYPES = {"Sen-G": "senate", "Sen-GS": "senate", "Gov-G": "governor"}


def _last(name: str) -> str:
    toks = [t for t in re.sub(r"[^a-z\- ]", " ", name.lower()).split() if t not in ("jr", "sr", "ii", "iii")]
    return toks[-1] if toks else ""


@lru_cache(maxsize=1)
def _load():
    rows = list(csv.DictReader(open(RAW)))
    pres = {}
    for r in rows:
        if r["type_simple"] == "Pres-G" and len(r["location"]) == 2:
            try:
                pres[(r["cycle"], r["location"])] = float(r["margin_actual"])
            except ValueError:
                pass
    races = {}
    for r in rows:
        if r["type_simple"] not in TYPES or r["cand1_party"] != "DEM" or r["cand2_party"] != "REP":
            continue
        races[r["race"]] = r
    out = []
    for r in races.values():
        cyc, st = r["cycle"], r["location"]
        pres_cyc = cyc if cyc in PRES_NATIONAL else str(int(cyc) - 2)
        if (pres_cyc, st) not in pres or cyc not in NATIONAL:
            continue
        lean = pres[(pres_cyc, st)] - PRES_NATIONAL[pres_cyc]
        expected = lean + NATIONAL[cyc]
        actual = float(r["margin_actual"])
        out.append({"cycle": cyc, "state": st, "office": TYPES[r["type_simple"]], "race": r["race"],
                    "d": r["cand1_name"], "r": r["cand2_name"], "actual": actual, "expected": expected,
                    "over": actual - expected})
    return out


def incumbent_effect(state: str, name: str, party: str) -> dict | None:
    """Carry-over (in D-minus-R margin points) for an incumbent now running."""
    ln = _last(name)
    hits = [x for x in _load() if x["state"] == state and _last(x["d" if party == "D" else "r"]) == ln]
    if not hits:
        return None
    h = max(hits, key=lambda x: x["cycle"])
    # Only credit overperformance in the incumbent's direction (and penalize underperformance).
    carry = max(-CAP, min(CAP, CARRY * h["over"]))
    return {"race": h["race"], "cycle": h["cycle"], "actual": round(h["actual"], 1),
            "expected": round(h["expected"], 1), "over": round(h["over"], 1), "carry": round(carry, 2)}
