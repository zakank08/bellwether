"""Campaign fundraising from the FEC API (free key: FEC_API_KEY).

One call per federal race: /v1/elections/ returns every candidate's total
receipts, disbursements and cash on hand for the 2026 cycle. Candidates are
matched to the race's principals by last name. No key -> no data, and the
fundraising term simply stays at zero.
"""
from __future__ import annotations

import os
import re

from ..http import fetch_json

URL = ("https://api.open.fec.gov/v1/elections/?api_key={key}&cycle=2026&office={office}&state={state}"
       "{district}&election_full=true&per_page=50&sort=-total_receipts")


def _last(name: str) -> str:
    """FEC names look like 'OSSOFF, T. JONATHAN'; ours like 'Jon Ossoff'."""
    name = name or ""
    if "," in name:
        name = name.split(",")[0]
    else:
        toks = [t for t in re.split(r"\s+", name) if t.strip(".").lower() not in ("jr", "sr", "ii", "iii", "iv")]
        name = toks[-1] if toks else ""
    return re.sub(r"[^a-z]", "", name.lower())


def match(results: list[dict], name: str | None) -> dict | None:
    if not name:
        return None
    ln = _last(name)
    hits = [r for r in results if _last(r.get("candidate_name", "")) == ln]
    if not hits:
        return None
    best = max(hits, key=lambda r: r.get("total_receipts") or 0)
    return {"fec_id": best.get("candidate_id"), "fec_name": best.get("candidate_name"),
            "receipts": best.get("total_receipts"), "disbursements": best.get("total_disbursements"),
            "cash_on_hand": best.get("cash_on_hand_end_period"), "through": (best.get("coverage_end_date") or "")[:10]}


class FECFundraising:
    name = "FEC"

    def __init__(self, key: str | None = None):
        self.key = key or os.environ.get("FEC_API_KEY")

    @property
    def enabled(self) -> bool:
        return bool(self.key)

    def race(self, office: str, state: str, district: int | None, d_name: str | None, r_name: str | None) -> dict | None:
        if not self.enabled or office not in ("senate", "house"):
            return None
        dist = "" if office == "senate" else f"&district={district:02d}"
        try:
            data = fetch_json(URL.format(key=self.key, office=office, state=state, district=dist), max_age_s=8 * 3600)
        except Exception:
            return None
        res = data.get("results", [])
        out = {"d": match(res, d_name), "r": match(res, r_name)}
        return out if (out["d"] or out["r"]) else None
