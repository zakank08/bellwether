"""Check which state election-results sites answer an automated request, from wherever this runs.

    python pipeline/tools/probe_results_sites.py            # print a table
    python pipeline/tools/probe_results_sites.py --write    # also save docs/results-probe-latest.json

Election-night results will be fetched by software, and many state sites sit behind bot protection
(Cloudflare, Imperva, Akamai) that turns away cloud servers. Running this from GitHub's runners tells us
which states will work there. One request per URL, an honest User-Agent, a pause between requests.
Status words: ok (page or data came back), challenge (a bot-check page), blocked (403/429 etc.),
missing (404), unreachable (network/TLS error).
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
UA = "BellwetherElectionTracker/0.1 (nonpartisan election forecast; https://bellwether-zak.vercel.app)"
# A real bot-check page is small and says so; a normal page can still carry Cloudflare's tracking snippet.
CHALLENGE = re.compile(r"<title>Just a moment|_Incapsula_Resource|<title>Access Denied|Request unsuccessful|Pardon Our Interruption|px-captcha", re.I)


def classify(url: str) -> dict:
    t0 = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/json,*/*"}), timeout=30)
        body = r.read(120000).decode("utf8", "ignore")
        status = "challenge" if CHALLENGE.search(body[:20000]) and "text/html" in r.headers.get("content-type", "") else "ok"
        return {"url": url, "result": status, "http": r.status, "type": r.headers.get("content-type", "").split(";")[0]}
    except urllib.error.HTTPError as e:
        body = e.read(20000).decode("utf8", "ignore") if hasattr(e, "read") else ""
        word = "challenge" if CHALLENGE.search(body) else "missing" if e.code in (404, 410) else "blocked"
        return {"url": url, "result": word, "http": e.code}
    except Exception as e:
        return {"url": url, "result": "unreachable", "error": str(e)[:80]}
    finally:
        time.sleep(max(0.0, 1.5 - (time.time() - t0)))


def main() -> int:
    sites = json.loads((ROOT / "data" / "config" / "results_sites.json").read_text())["states"]
    out = {st: [classify(u) for u in urls] for st, urls in sorted(sites.items())}
    for st, rows in out.items():
        print(st, " | ".join(f"{r['result']}({r.get('http', '-')})" for r in rows), "|", rows[0]["url"])
    counts: dict[str, int] = {}
    for rows in out.values():
        best = "ok" if any(r["result"] == "ok" for r in rows) else rows[0]["result"]
        counts[best] = counts.get(best, 0) + 1
    print("\nstates by best result:", counts)
    if "--write" in sys.argv:
        (ROOT / "docs" / "results-probe-latest.json").write_text(json.dumps(
            {"_about": "Written by .github/workflows/results-probe.yml from GitHub's servers. 'result' is what an automated request got.",
             "by_state": out, "summary": counts}, indent=1) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
