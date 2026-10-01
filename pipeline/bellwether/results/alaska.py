"""Alaska Division of Elections: one CSV with a row per precinct, contest and candidate.
https://www.elections.alaska.gov/results/<ELECTIONCODE>/ENRbyPrecinct.csv  (2024 general: 24GENR)
Alaska's House seat is at large (district 0). Ranked-choice counting is not in this file; we report first choices."""
from __future__ import annotations

import csv
import io
from collections import defaultdict

from .contests import classify
from .model import Cand, RaceResult, party_side

SOURCE = "Alaska Division of Elections"
def _flip_name(n: str) -> str:
    """'Begich, Nick' -> 'Nick Begich'."""
    if "," in n:
        last, first = n.split(",", 1)
        return f"{first.strip()} {last.strip()}"
    return n.strip()


def parse(text: str, year: int = 2026, url: str = "") -> list[RaceResult]:
    rows = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    votes: dict[str, dict[tuple[str, str], int]] = defaultdict(lambda: defaultdict(int))
    units: dict[str, dict[str, bool]] = defaultdict(dict)
    for r in rows:
        rid = classify((r.get("Contest_title") or "").strip(), "AK", year)
        if not rid:
            continue
        v = int(r.get("total_votes") or 0)
        nm = r["candidate_name"].split("/")[0] if "-gov-" in rid else r["candidate_name"]  # governor rows list the ticket
        votes[rid][(_flip_name(nm), party_side(r.get("Party_Code", "")))] += v
        pr = r.get("Precinct_name", "")
        reported = r.get("Reporting_flag") == "1" or int(r.get("total_ballots") or 0) > 0
        units[rid][pr] = units[rid].get(pr, False) or reported
    out = []
    for rid, cs in votes.items():
        cands = [Cand(n, p, v) for (n, p), v in sorted(cs.items(), key=lambda kv: -kv[1])]
        out.append(RaceResult(rid, "AK", cands, sum(units[rid].values()), len(units[rid]), SOURCE, url))
    return out


def fetch(election_code: str, year: int = 2026) -> list[RaceResult]:
    from .. import http
    url = f"https://www.elections.alaska.gov/results/{election_code}/ENRbyPrecinct.csv"
    return parse(http.fetch(url, max_age_s=25).decode("utf-8-sig"), year, url)
