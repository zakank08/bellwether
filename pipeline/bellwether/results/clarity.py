"""Classic Clarity ENR sites (Colorado, South Carolina, Kentucky, Arkansas, New Jersey and others).
An election lives at <site>/<STATE>/<election id>/ (the id is in the address when you open the election on the state's page).
`current_ver.txt` holds the latest version number; `<version>/reports/summary.zip` holds `summary.csv` with one row per
contest and choice, statewide, including how many areas (counties) have reported."""
from __future__ import annotations

import csv
import io
import zipfile
from collections import defaultdict

from .contests import classify, ticket_name
from .model import Cand, RaceResult, party_side

SOURCES = {  # site base, label
    "CO": ("https://results.enr.clarityelections.com/CO", "Colorado Secretary of State"),
    "SC": ("https://enr-scvotes.org/SC", "South Carolina Election Commission"),
    "KY": ("https://results.enr.clarityelections.com/KY", "Kentucky State Board of Elections"),
    "AR": ("https://results.enr.clarityelections.com/AR", "Arkansas Secretary of State"),
    "NJ": ("https://results.enr.clarityelections.com/NJ", "New Jersey Division of Elections"),
}


def parse(text: str, state: str, year: int = 2026, url: str = "") -> list[RaceResult]:
    label = SOURCES[state][1]
    cands: dict[str, list[Cand]] = defaultdict(list)
    units: dict[str, tuple[int, int]] = {}
    for r in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        rid = classify(r["contest name"], state, year)
        if not rid:
            continue
        name = ticket_name(r["choice name"]) if "-gov-" in rid else r["choice name"].strip()
        if name.lower() in ("write-in", "write-ins", "total write-ins", "scattering"):
            continue
        cands[rid].append(Cand(name, party_side(r.get("party name", "")), int(r["total votes"] or 0)))
        try:
            units[rid] = (int(r["num Area rptg"]), int(r["num Area total"]))
        except (KeyError, ValueError):
            units.setdefault(rid, (0, 0))
    out = []
    for rid, cs in cands.items():
        cs.sort(key=lambda c: -c.votes)
        u = units.get(rid, (0, 0))
        out.append(RaceResult(rid, state, cs, u[0], u[1], label, url))
    return out


def discover(state: str, date: str = "11/3/2026") -> str:
    """Clarity sites list their elections at <site>/<STATE>/elections.json; the entry dated Nov. 3, 2026 holds the id (EID)."""
    from .. import http
    import json
    els = json.loads(http.fetch(f"{SOURCES[state][0]}/elections.json", max_age_s=300, allow_stale=False, retries=2, timeout=25))
    hits = [e for e in els if str(e.get("Date", "")).startswith(date)]
    if not hits:
        raise RuntimeError(f"{state}: no election dated {date} is listed yet")
    return str(hits[0]["EID"])


def fetch(state: str, election_id: str, year: int = 2026) -> list[RaceResult]:
    from .. import http
    if election_id in ("auto", "now", ""):
        election_id = discover(state)
    base = f"{SOURCES[state][0]}/{election_id}"
    ver = http.fetch(f"{base}/current_ver.txt", max_age_s=20, allow_stale=False, retries=2, timeout=25).decode().strip()
    url = f"{base}/{ver}/reports/summary.zip"
    z = zipfile.ZipFile(io.BytesIO(http.fetch(url, max_age_s=20, allow_stale=False, retries=2, timeout=25)))
    text = z.read("summary.csv").decode("utf-8", errors="replace")
    return parse(text, state, year, f"{base}/")
