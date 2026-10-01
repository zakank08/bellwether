"""Enhanced Voting ENR sites (Georgia, Utah, Washington, Idaho): a public JSON API.
Georgia 2024 example: https://results.sos.ga.gov/results/public/api/elections/Georgia/2024NovGen/ballot-items
Every contest is one `ballot-items` entry with candidate totals and precincts reporting."""
from __future__ import annotations

import json
import re

from .model import Cand, RaceResult, house_id, party_side, senate_id

SITES = {
    "GA": ("Georgia Secretary of State", "https://results.sos.ga.gov/results/public/api/elections/Georgia/{election}/ballot-items"),
}
_NAME_PARTY = re.compile(r"\s*\(([A-Za-z .-]+)\)\s*$")
_TRAILING = re.compile(r"(\s*\([A-Za-z .-]+\))+\s*$")


def _text(x) -> str:
    return (x[0]["text"] if isinstance(x, list) and x else x or "").strip()


def race_id_for(state: str, title: str, year: int) -> str | None:
    t = title.lower()
    m = re.search(r"u\.?s\.? house of representatives\s*-\s*district\s*(\d+)", t) or re.search(r"u\.?s\.? house.*district\s*(\d+)", t)
    if m:
        return house_id(year, state, int(m.group(1)))
    if re.fullmatch(r"(us|u\.s\.) senat(e|or)( .*)?", t) and "state" not in t:
        return senate_id(year, state, special="special" in t)
    return None


def parse(data: dict, state: str, year: int = 2026, url: str = "") -> list[RaceResult]:
    source = SITES[state][0]
    out = []
    for item in data["data"]:
        rid = race_id_for(state, _text(item["name"]), year)
        if not rid:
            continue
        cands = []
        for o in item["summaryResults"]["ballotOptions"]:
            if o.get("isWriteIn") and not o.get("voteCount"):
                continue
            name = _text(o["name"])
            m = _NAME_PARTY.search(name)
            party = (o.get("party") or {}).get("abbreviation") or (m.group(1) if m else "")
            cands.append(Cand(_TRAILING.sub("", name), party_side(party), int(o.get("voteCount") or 0)))
        cands.sort(key=lambda c: -c.votes)
        rs = item.get("reportingStatus") or {}
        out.append(RaceResult(rid, state, cands, int(rs.get("reportingUnits") or 0), int(rs.get("totalUnits") or 0),
                              source, url, rs.get("asOf")))
    return out


def fetch(state: str, election: str, year: int = 2026) -> list[RaceResult]:
    from .. import http
    url = SITES[state][1].format(election=election)
    return parse(json.loads(http.fetch(url, max_age_s=25)), state, year, url)
