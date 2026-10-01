"""Enhanced Voting ENR sites (Georgia, Utah, Washington, Idaho): a public JSON API.
Georgia 2024 example: https://results.sos.ga.gov/results/public/api/elections/Georgia/2024NovGen/ballot-items
Every contest is one `ballot-items` entry with candidate totals and precincts reporting."""
from __future__ import annotations

import json
import re

from .contests import classify, ticket_name
from .model import Cand, RaceResult, party_side

SITES = {
    "GA": ("Georgia Secretary of State", "https://results.sos.ga.gov/results/public/api/elections/Georgia/{election}/ballot-items"),
    # Same platform, same address pattern. NOT yet tested: the 2024 election ids were not found from outside the site.
    "UT": ("Utah Elections Office", "https://electionresults.utah.gov/results/public/api/elections/Utah/{election}/ballot-items"),
    "WA": ("Washington Secretary of State", "https://results.votewa.gov/results/public/api/elections/Washington/{election}/ballot-items"),
    "ID": ("Idaho Secretary of State", "https://voteidaho.gov/results/public/api/elections/Idaho/{election}/ballot-items"),
}
_NAME_PARTY = re.compile(r"\s*\(([A-Za-z .-]+)\)\s*$")
_TRAILING = re.compile(r"(\s*\([A-Za-z .-]+\))+\s*$")


def _text(x) -> str:
    return (x[0]["text"] if isinstance(x, list) and x else x or "").strip()


def race_id_for(state: str, title: str, year: int) -> str | None:
    return classify(title, state, year)


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
            clean = _TRAILING.sub("", name)
            cands.append(Cand(ticket_name(clean) if "-gov-" in rid else clean, party_side(party), int(o.get("voteCount") or 0)))
        cands.sort(key=lambda c: -c.votes)
        rs = item.get("reportingStatus") or {}
        out.append(RaceResult(rid, state, cands, int(rs.get("reportingUnits") or 0), int(rs.get("totalUnits") or 0),
                              source, url, rs.get("asOf")))
    return out


def fetch(state: str, election: str, year: int = 2026) -> list[RaceResult]:
    from .. import http
    url = SITES[state][1].format(election=election)
    return parse(json.loads(http.fetch(url, max_age_s=25)), state, year, url)
