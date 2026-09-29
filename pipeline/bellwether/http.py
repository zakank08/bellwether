"""Polite HTTP client shared by every adapter.

- Identifies itself with a descriptive User-Agent.
- Enforces a minimum delay per host (Wikipedia asks for this).
- Caches raw responses on disk so reruns don't re-hit sources, and so the
  pipeline can run offline from the last good fetch when a source is down.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

USER_AGENT = os.environ.get(
    "BELLWETHER_USER_AGENT",
    "BellwetherElectionTracker/0.1 (nonpartisan election forecast; set BELLWETHER_USER_AGENT to add contact info)",
)
CACHE_DIR = Path(os.environ.get("BELLWETHER_CACHE", Path(__file__).resolve().parents[2] / "data" / "cache"))
MIN_INTERVAL = {"en.wikipedia.org": 6.0, "en.wikipedia.org/rest": 1.0, "www.wikidata.org": 1.0}
DEFAULT_INTERVAL = 1.0
_last_hit: dict[str, float] = {}


class FetchError(RuntimeError):
    pass


def _cache_path(url: str) -> Path:
    return CACHE_DIR / (hashlib.sha1(url.encode()).hexdigest() + ".body")


def fetch(url: str, *, max_age_s: float = 3600, allow_stale: bool = True, retries: int = 3) -> bytes:
    """Fetch a URL with caching, per-host throttling and backoff.

    If the network fetch fails and a cached copy exists, the cached copy is
    returned (stale) when allow_stale is true, so one dead feed never takes the
    whole pipeline down.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(url)
    if path.exists() and time.time() - path.stat().st_mtime < max_age_s:
        return path.read_bytes()
    host = urlparse(url).netloc
    if "/api/rest_v1/" in url:
        host += "/rest"   # Wikipedia's REST API has its own, looser limits
    last_err: Exception | None = None
    for attempt in range(retries):
        wait = MIN_INTERVAL.get(host, DEFAULT_INTERVAL) - (time.time() - _last_hit.get(host, 0))
        if wait > 0:
            time.sleep(wait)
        _last_hit[host] = time.time()
        try:
            r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
            if r.status_code == 429:
                time.sleep(float(r.headers.get("Retry-After", 20 * (attempt + 1))))
                last_err = FetchError(f"429 from {host}")
                continue
            r.raise_for_status()
            path.write_bytes(r.content)
            return r.content
        except requests.RequestException as e:  # network or HTTP error
            last_err = e
            time.sleep(2 ** attempt)
    if allow_stale and path.exists():
        return path.read_bytes()
    raise FetchError(f"could not fetch {url}: {last_err}")


def fetch_json(url: str, **kw):
    return json.loads(fetch(url, **kw))
