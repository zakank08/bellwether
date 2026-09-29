"""Short candidate bios and official websites.

Bio: the first sentences of the candidate's Wikipedia article (REST summary
endpoint; CC BY-SA, credited and linked on the page). Website: Wikidata's
"official website" property (P856). Cached for a week; failures are skipped.
"""
from __future__ import annotations

import re
from urllib.parse import quote

from ..http import fetch_json

SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{t}"
WIKIDATA = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids={ids}&props=claims&format=json"


def _short(text: str, limit: int = 320) -> str:
    sents = re.split(r"(?<=[.!?])\s+", (text or "").strip())
    out = ""
    for s in sents:
        if len(out) + len(s) > limit and out:
            break
        out = (out + " " + s).strip()
    return out


def fetch_bios(titles: list[str], budget: int = 120, deadline_s: float = 480) -> dict[str, dict]:
    """Cached bios are free; at most `budget` new network fetches per run (and
    no more than `deadline_s` seconds), so the scheduled job never stalls on
    Wikipedia's rate limits. The cache fills in over a few runs."""
    import time
    from ..http import _cache_path
    out: dict[str, dict] = {}
    fetched, t0 = 0, time.time()
    for t in titles:
        url = SUMMARY.format(t=quote(t.replace(" ", "_"), safe=""))
        cached = _cache_path(url).exists()
        if not cached:
            if fetched >= budget or time.time() - t0 > deadline_s:
                continue
            fetched += 1
        try:
            s = fetch_json(url, max_age_s=7 * 86400, allow_stale=True, retries=3 if cached else 1)
        except Exception:
            continue
        if s.get("type") == "disambiguation":
            continue
        out[t] = {"title": t, "description": s.get("description"), "bio": _short(s.get("extract", "")),
                  "url": (s.get("content_urls") or {}).get("desktop", {}).get("page"), "qid": s.get("wikibase_item")}
    qids = [b["qid"] for b in out.values() if b.get("qid")]
    sites: dict[str, str] = {}
    for i in range(0, len(qids), 50):
        try:
            d = fetch_json(WIKIDATA.format(ids="|".join(qids[i:i + 50])), max_age_s=7 * 86400, allow_stale=True)
        except Exception:
            continue
        for qid, ent in (d.get("entities") or {}).items():
            for cl in (ent.get("claims") or {}).get("P856", []):
                v = cl.get("mainsnak", {}).get("datavalue", {}).get("value")
                if isinstance(v, str) and v.startswith("http"):
                    sites[qid] = v
                    break
    for b in out.values():
        b["website"] = sites.get(b.get("qid"))
    return out
