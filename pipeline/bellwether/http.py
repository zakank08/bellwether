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
# Per-host record of this run: fresh fetches, cache hits, and stale fallbacks
# (a source was down and the last good copy was used). Published so the site
# can say plainly when a source is out of date.
STATUS: dict[str, dict] = {}


def _mark(host: str, kind: str, url: str, age_s: float | None = None):
    st = STATUS.setdefault(host, {"fresh": 0, "cached": 0, "stale": 0, "oldest_stale_h": None})
    st[kind] += 1
    if kind == "stale" and age_s is not None:
        h = round(age_s / 3600, 1)
        st["oldest_stale_h"] = max(st["oldest_stale_h"] or 0, h)


class FetchError(RuntimeError):
    pass


def _cache_path(url: str) -> Path:
    return CACHE_DIR / (hashlib.sha1(url.encode()).hexdigest() + ".body")


def _meta_path(url: str) -> Path:
    return _cache_path(url).with_suffix(".meta")


def cache_age(url: str) -> float | None:
    """Seconds since this URL was actually fetched. Stored in a sidecar file,
    not the file's mtime: a fresh git checkout resets every mtime to "now",
    which would make a days-old cached copy look brand new in CI."""
    m = _meta_path(url)
    if m.exists():
        try:
            return time.time() - json.loads(m.read_text())["fetched_at"]
        except (ValueError, KeyError):
            return None
    return None


def fetch(url: str, *, max_age_s: float = 3600, allow_stale: bool = True, retries: int = 3) -> bytes:
    """Fetch a URL with caching, per-host throttling and backoff.

    If the network fetch fails and a cached copy exists, the cached copy is
    returned (stale) when allow_stale is true, so one dead feed never takes the
    whole pipeline down.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(url)
    host = urlparse(url).netloc
    age = cache_age(url) if path.exists() else None
    if age is not None and age < max_age_s:
        _mark(host, "cached", url)
        return path.read_bytes()
    throttle_key = host + ("/rest" if "/api/rest_v1/" in url else "")  # Wikipedia REST has looser limits
    last_err: Exception | None = None
    for attempt in range(retries):
        wait = MIN_INTERVAL.get(throttle_key, DEFAULT_INTERVAL) - (time.time() - _last_hit.get(throttle_key, 0))
        if wait > 0:
            time.sleep(wait)
        _last_hit[throttle_key] = time.time()
        try:
            r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
            if r.status_code == 429:
                time.sleep(float(r.headers.get("Retry-After", 20 * (attempt + 1))))
                last_err = FetchError(f"429 from {host}")
                continue
            r.raise_for_status()
            path.write_bytes(r.content)
            _meta_path(url).write_text(json.dumps({"url": url, "fetched_at": time.time()}))
            _mark(host, "fresh", url)
            return r.content
        except requests.RequestException as e:  # network or HTTP error
            last_err = e
            time.sleep(2 ** attempt)
    if allow_stale and path.exists():
        _mark(host, "stale", url, cache_age(url))
        return path.read_bytes()
    raise FetchError(f"could not fetch {url}: {last_err}")


def fetch_json(url: str, **kw):
    return json.loads(fetch(url, **kw))
