"""North Carolina State Board of Elections: a ZIP holding one tab-separated file, one row per precinct, contest and choice.
https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/<YYYY_MM_DD>/results_pct_<YYYYMMDD>.zip  (2024 general: 2024_11_05)
NC drew new House districts for 2026; contest names carry the new district number, so nothing here uses old maps."""
from __future__ import annotations

import csv
import io
import re
import zipfile
from collections import defaultdict

from .model import Cand, RaceResult, house_id, party_side, senate_id

SOURCE = "North Carolina State Board of Elections"
_HOUSE = re.compile(r"^US HOUSE OF REPRESENTATIVES DISTRICT (\d+)$")


def _race_id(contest: str, year: int) -> str | None:
    m = _HOUSE.match(contest.strip().upper())
    if m:
        return house_id(year, "NC", int(m.group(1)))
    if contest.strip().upper() in ("US SENATE", "US SENATOR"):
        return senate_id(year, "NC")
    return None


def parse(text: str, year: int = 2026, url: str = "") -> list[RaceResult]:
    votes: dict[str, dict[tuple[str, str], int]] = defaultdict(lambda: defaultdict(int))
    seen: dict[str, dict[tuple[str, str], int]] = defaultdict(lambda: defaultdict(int))
    county: dict[str, dict[str, list[int]]] = defaultdict(lambda: defaultdict(lambda: [0, 0, 0]))
    for r in csv.DictReader(io.StringIO(text), delimiter="\t"):
        rid = _race_id(r.get("Contest Name", ""), year)
        if not rid:
            continue
        v = int(r.get("Total Votes") or 0)
        side = party_side(r.get("Choice Party", ""))
        votes[rid][(r["Choice"].strip(), side)] += v
        if "-sen-" in rid:  # county detail only for statewide races
            county[rid][r["County"].strip().title()]["DRO".index(side)] += v
        if r.get("Real Precinct", "Y") != "N":  # one-stop and mail votes sit in county-level pseudo precincts: they count as votes, not as precincts
            seen[rid][(r["County"], r["Precinct"])] += v
    out = []
    for rid, cs in votes.items():
        cands = [Cand(n, p, v) for (n, p), v in sorted(cs.items(), key=lambda kv: -kv[1])]
        out.append(RaceResult(rid, "NC", cands, sum(1 for v in seen[rid].values() if v > 0), len(seen[rid]), SOURCE, url,
                              counties={k: v for k, v in county[rid].items()} if rid in county else None))
    return out


def fetch(date: str, year: int = 2026) -> list[RaceResult]:
    """`date` is like 2026_11_03."""
    from .. import http
    url = f"https://s3.amazonaws.com/dl.ncsbe.gov/ENRS/{date}/results_pct_{date.replace('_', '')}.zip"
    z = zipfile.ZipFile(io.BytesIO(http.fetch(url, max_age_s=25)))
    text = z.read(z.namelist()[0]).decode("utf-8", errors="replace")
    return parse(text, year, url)
