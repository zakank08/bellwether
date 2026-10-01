"""Minnesota Secretary of State: semicolon-separated text files, one per contest group, at
https://electionresultsfiles.sos.state.mn.us/<YYYYMMDD>/<file>.txt   (files: ussenate, ushouse, governor)
Columns (no header): state; county; ?; office id; office name; district; candidate id; name; ?; ?; party;
precincts reporting; precincts total; votes; percent; total votes for the office."""
from __future__ import annotations

import csv
import io
from collections import defaultdict

from .contests import classify, ticket_name
from .model import Cand, RaceResult, party_side

SOURCE = "Minnesota Secretary of State"
FILES = ("ussenate", "ushouse", "governor")


def _title(office: str, district: str) -> str:
    return office if office.lower().startswith("u.s. representative district") or not district else f"{office} District {district}"


def parse(text: str, year: int = 2026, url: str = "") -> list[RaceResult]:
    cands: dict[str, list[Cand]] = defaultdict(list)
    units: dict[str, tuple[int, int]] = {}
    for r in csv.reader(io.StringIO(text), delimiter=";"):
        if len(r) < 14:
            continue
        rid = classify(_title(r[4], r[5]), "MN", year)
        if not rid:
            continue
        name = ticket_name(r[7].replace(" and ", " / ")) if "-gov-" in rid else r[7].strip()
        if name.lower().startswith("write-in"):
            continue
        cands[rid].append(Cand(name, party_side(r[10]), int(r[13] or 0)))
        units[rid] = (int(r[11] or 0), int(r[12] or 0))
    out = []
    for rid, cs in cands.items():
        cs.sort(key=lambda c: -c.votes)
        u = units[rid]
        out.append(RaceResult(rid, "MN", cs, u[0], u[1], SOURCE, url))
    return out


def fetch(date: str, year: int = 2026) -> list[RaceResult]:
    """`date` is like 20261103."""
    from .. import http
    out: list[RaceResult] = []
    errors = []
    for f in FILES:
        url = f"https://electionresultsfiles.sos.state.mn.us/{date}/{f}.txt"
        try:
            out += parse(http.fetch(url, max_age_s=20).decode("utf-8", errors="replace"), year, url)
        except http.FetchError as ex:
            errors.append(str(ex))  # a contest group may not exist yet; the other files still count
    if errors and not out:
        raise http.FetchError("; ".join(errors)[:200])
    return out
