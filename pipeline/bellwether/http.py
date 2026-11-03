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
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
import re
from urllib.parse import urlparse

import requests

try:
    import certifi
except ImportError:  # pragma: no cover
    certifi = None

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


_SECRET_PARAM = re.compile(r"([?&](?:api_key|apikey|key|token|access_token)=)[^&#]*", re.I)


def redact(url: str) -> str:
    """Hide API keys in a URL. Cache sidecars are committed to a public repo,
    so anything written to disk or printed must go through this."""
    return _SECRET_PARAM.sub(r"\1REDACTED", url)


def _retry_after(value: str | None, default: float, cap: float = 120.0) -> float:
    """Seconds to wait for a Retry-After header, which may be a number or an HTTP date."""
    if value:
        try:
            return min(max(float(value), 0.0), cap)
        except ValueError:
            try:
                when = parsedate_to_datetime(value)
                return min(max((when - datetime.now(when.tzinfo)).total_seconds(), 0.0), cap)
            except (TypeError, ValueError):
                pass
    return default


# Hosts whose servers leave out an intermediate certificate (checked against GitHub's servers too: plain verification fails).
# For these only, verify against the normal trusted roots PLUS the public intermediates in data/config/extra_ca.pem.
# Verification is never turned off.
EXTRA_CA_HOSTS = {"www.elections.alaska.gov", "elections.alaska.gov"}
EXTRA_CA_FILE = Path(__file__).resolve().parents[2] / "data" / "config" / "extra_ca.pem"


def _verify_for(host: str):
    """The `verify=` argument for requests: True normally, or a combined bundle for hosts in EXTRA_CA_HOSTS."""
    if host not in EXTRA_CA_HOSTS or not EXTRA_CA_FILE.exists():
        return True
    base = os.environ.get("REQUESTS_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE") or (certifi.where() if certifi else None)
    if not base or not Path(base).exists():
        return True
    out = CACHE_DIR / "ca-bundle-extra.pem"
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out.write_text(Path(base).read_text() + "\n" + EXTRA_CA_FILE.read_text())
    return str(out)


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


def fetch(url: str, *, max_age_s: float = 3600, allow_stale: bool = True, retries: int = 3, timeout: float = 60) -> bytes:
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
            r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout, verify=_verify_for(host))
            if r.status_code == 429:
                time.sleep(_retry_after(r.headers.get("Retry-After"), 20 * (attempt + 1)))
                last_err = FetchError(f"429 from {host}")
                continue
            r.raise_for_status()
            path.write_bytes(r.content)
            _meta_path(url).write_text(json.dumps({"url": redact(url), "fetched_at": time.time()}))
            _mark(host, "fresh", url)
            return r.content
        except requests.RequestException as e:  # network or HTTP error
            last_err = e
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    if allow_stale and path.exists():
        _mark(host, "stale", url, cache_age(url))
        return path.read_bytes()
    raise FetchError(f"could not fetch {redact(url)}: {redact(str(last_err))}")


def fetch_json(url: str, **kw):
    return json.loads(fetch(url, **kw))
