"""Indiana Election Division ENR (enr.indianavoters.in.gov): an open set of JSON files that the state's own results app reads.
  data/settings.json                  -> VersionType (a letter, used in every other file name)
  data/OffCatC_<officeCategory>_<V>.json -> one file per office; 1005 = U.S. House (nine districts)
  data/statewideTurnout_<V>.json      -> per-county turnout, used here as the "counties reporting" count
Indiana has no U.S. Senate or governor race in 2026."""
from __future__ import annotations

import json

from .model import Cand, RaceResult, house_id, party_side

BASE = "https://enr.indianavoters.in.gov/site"
SOURCE = "Indiana Election Division"
ORD = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9}


def _district(title: str) -> int | None:
    t = title.lower()
    for w, n in ORD.items():
        if f"{w} district" in t:
            return n
    return None


def parse(offcat: dict, turnout: dict | None = None, year: int = 2026, url: str = "") -> list[RaceResult]:
    root = offcat.get("Root", offcat)
    races = root["StatewideSummary"]["Race"]
    races = races if isinstance(races, list) else [races]
    counties = [c for c in ((turnout or {}).get("root", (turnout or {}).get("Root", {})).get("CountyTurnout") or []) if c.get("County") != "Total"]
    total = len(counties)
    reporting = sum(1 for c in counties if (c.get("VotersVoting") or 0) > 0)
    out = []
    for r in races:
        title = r.get("OFFICE_TITLE", "")
        d = _district(title) if "representative" in title.lower() else None
        if d is None:
            continue
        cs = r["Candidates"]["Candidate"]
        cs = cs if isinstance(cs, list) else [cs]
        cands = [Cand(c["NAME_ON_BALLOT"].replace("(W/I)", "").strip(), party_side(c.get("PARTY", "")), int(c.get("TOTAL") or 0)) for c in cs]
        cands.sort(key=lambda c: -c.votes)
        out.append(RaceResult(house_id(year, "IN", d), "IN", cands, reporting, total, SOURCE, url, root.get("WriteTime")))
    return out


def fetch(election: str = "now", year: int = 2026) -> list[RaceResult]:
    from .. import http
    kw = dict(max_age_s=20, allow_stale=False, retries=2, timeout=25)
    ver = json.loads(http.fetch(f"{BASE}/data/settings.json", **kw).decode("utf-8-sig")).get("Root", {}).get("VersionType") or "A"
    url = f"{BASE}/data/OffCatC_1005_{ver}.json"
    offcat = json.loads(http.fetch(url, **kw).decode("utf-8-sig"))
    try:
        turnout = json.loads(http.fetch(f"{BASE}/data/statewideTurnout_{ver}.json", **kw).decode("utf-8-sig"))
    except Exception:  # noqa: BLE001 - the vote counts matter more than the county count
        turnout = None
    return parse(offcat, turnout, year, f"{BASE}/index.html")
