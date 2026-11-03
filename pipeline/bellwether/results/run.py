"""Command line for election night.

  python -m bellwether.results.run --once --out /tmp/live            one pass, write the two files
  python -m bellwether.results.run --loop --upload                   the election-night loop; publishes to Cloudflare R2 when its
                                                                     keys exist, otherwise into the site itself (web/public/data/live)
  python -m bellwether.results.run --rehearse --out /tmp/live        replay 2024 files in fast motion (no network)

Which feeds to read comes from data/config/live_sources.json (a state is only read once its 2026 election exists)."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from . import alaska, clarity, enhanced_voting, minnesota, north_carolina, worker
from .replay import Replay

ROOT = Path(__file__).resolve().parents[3]
SOURCES = ROOT / "data" / "config" / "live_sources.json"
OVERRIDES = ROOT / "data" / "config" / "live_overrides.json"
FIXTURES = ROOT / "pipeline" / "tests" / "fixtures" / "results"


REPO = os.environ.get("GITHUB_REPOSITORY", "zakank08/bellwether")
LIVE_DIR = ROOT / "web" / "public" / "data" / "live"


def remote_json(path: str):
    """Read a file from the repository's main branch through the GitHub API, so a hand correction committed a minute ago is seen
    without restarting the worker (the job's own checkout never changes). Returns None when it cannot be read."""
    import requests
    headers = {"Accept": "application/vnd.github.raw+json", "User-Agent": "bellwether-worker"}
    if os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    try:
        r = requests.get(f"https://api.github.com/repos/{REPO}/contents/{path}?ref=main", headers=headers, timeout=15)
        r.raise_for_status()
        return json.loads(r.text)
    except Exception:  # noqa: BLE001 - fall back to the local copy
        return None


def local_json(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def current_config() -> tuple[dict, dict, list[str]]:
    """(sources, overrides, problems). The newest copy on main wins; the checked-out copy is the fallback."""
    problems = []
    src = remote_json("data/config/live_sources.json") or local_json(SOURCES) or {"year": 2026, "states": {}}
    ov = remote_json("data/config/live_overrides.json")
    if ov is None:
        ov = local_json(OVERRIDES)
        if ov is None:
            ov = {}
            problems.append("live_overrides.json could not be read or is not valid JSON; hand corrections are NOT being applied")
    return src, ov, problems


def _try_each(fn, ids):
    """`election` may be one id or a list of ids to try in order (the state's exact id is not always known beforehand)."""
    ids = ids if isinstance(ids, list) else [ids]
    err = None
    for i in ids:
        try:
            return fn(i)
        except Exception as ex:  # noqa: BLE001
            err = ex
    raise err  # type: ignore[misc]


def readers_from_config(cfg: dict | None = None) -> dict:
    cfg = cfg or json.loads(SOURCES.read_text())
    y = cfg["year"]
    out = {}
    for st, c in cfg["states"].items():
        if not c.get("election"):
            continue  # not published yet
        k, e = c["reader"], c["election"]
        if k == "alaska":
            out[st] = lambda e=e: _try_each(lambda i: alaska.fetch(i, y), e)
        elif k == "north_carolina":
            out[st] = lambda e=e: _try_each(lambda i: north_carolina.fetch(i, y), e)
        elif k == "minnesota":
            out[st] = lambda e=e: _try_each(lambda i: minnesota.fetch(i, y), e)
        elif k == "clarity":
            out[st] = lambda st=st, e=e: _try_each(lambda i: clarity.fetch(st, i, y), e)
        elif k == "enhanced_voting":
            out[st] = lambda st=st, e=e: _try_each(lambda i: enhanced_voting.fetch(st, i, y), e)
    return out


def upload(out: Path) -> None:
    """Copy the files to a Cloudflare R2 bucket (S3-compatible). Keys come from GitHub secrets, never from code."""
    import boto3  # installed by the workflow
    s3 = boto3.client("s3", endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
                      aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                      region_name="auto")
    for name in ("live.json", "results.json", "status.json"):
        s3.put_object(Bucket=os.environ["R2_BUCKET"], Key=f"live/{name}", Body=(out / name).read_bytes(),
                      ContentType="application/json", CacheControl="public, max-age=10")


def r2_configured() -> bool:
    return all(os.environ.get(k) for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"))


def publish_to_site(out: Path, name: str = "live.json") -> bool:
    """No storage account needed: commit the live files to main, which redeploys the site with them (about a minute).
    Used when Cloudflare R2 is not set up. Slower (minutes, not seconds) but needs nothing from anyone."""
    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    (LIVE_DIR / name).write_text((out / name).read_text())
    git = lambda *a: subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True)  # noqa: E731
    git("config", "user.name", "bellwether-bot"); git("config", "user.email", "bot@users.noreply.github.com")
    git("add", f"web/public/data/live/{name}")
    if git("diff", "--cached", "--quiet").returncode == 0:
        return False
    git("commit", "-m", "Live results update (automatic)" if name == "live.json" else f"Rehearsal feed ({name}), not real results")
    for attempt in range(4):
        git("pull", "--rebase", "--autostash", "origin", "main")
        if git("push", "origin", "HEAD:main").returncode == 0:
            return True
        time.sleep(3 * (attempt + 1))
    print("could not push live results to main after 4 tries")
    return False


def publish_every_s(now: datetime | None = None, has_votes: bool = True) -> int:
    """How often the site-publish fallback pushes. Every push is a site build; Vercel's free plan allows about 100 a day,
    so it is quicker while results are pouring in (6 p.m. to 2 a.m. Eastern) and slower around that."""
    if not has_votes:
        return 7200  # nothing counted anywhere yet: no reason to rebuild the site more than every two hours
    h = (now or datetime.now(timezone.utc)).hour
    return 720 if (h >= 23 or h < 7) else 2400


def seed_previous() -> dict | None:
    """When a later job in the chain starts, pick up where the last one stopped (so a state whose feed is down right now still shows
    its last good numbers)."""
    j = remote_json("web/public/data/live/live.json")
    if j and j.get("results") and j.get("status"):
        return {"results": j["results"], "status": j["status"]}
    return None


def rehearsal_feed(out: Path) -> None:
    """A full dress rehearsal through the real worker code, written to rehearsal.json (NEVER live.json): several states part-counted, one
    state whose feed goes down after working, and one result entered by hand, so every banner and label can be seen on
    /election-night/?rehearsal=1. The numbers come from old 2022/2024 files and are not real 2026 results."""
    from . import enhanced_voting
    fx = FIXTURES
    final = []
    final += minnesota.parse((fx / "mn_2022_governor.txt").read_text(), 2026)
    final += minnesota.parse((fx / "mn_2024_ussenate.txt").read_text(), 2026)
    final += minnesota.parse((fx / "mn_2024_ushouse.txt").read_text(), 2026)
    final += north_carolina.parse((fx / "nc_2024.tsv").read_text(), 2026)
    final += alaska.parse((fx / "ak_2024.csv").read_text(), 2026)
    final += clarity.parse((fx / "co_2024_summary.csv").read_text(), "CO", 2026)
    final += enhanced_voting.parse(json.loads((fx / "ga_2024_ballot-items.json").read_text()), "GA", 2026)
    rp = Replay(final)
    by_state: dict[str, list] = {}
    for r in final:
        by_state.setdefault(r.state, []).append(r)
    rp.at(150)
    good = {st: (lambda st=st: [x for x in rp.read() if x.state == st]) for st in by_state}
    res, st = worker.run_once(good, None, {}, None)
    rp.at(180)
    bad = dict(good)
    bad["AK"] = lambda: (_ for _ in ()).throw(RuntimeError("HTTP 503 (rehearsal)"))
    ov = {"results": [{"race_id": "2026-house-NC-13", "cands": [{"name": "Rehearsal candidate A", "party": "D", "votes": 171835}, {"name": "Rehearsal candidate B", "party": "R", "votes": 243655}],
                       "units_reporting": 90, "units_total": 100, "source": "a rehearsal county page", "reason": "Rehearsal of a hand entry"}]}
    res, st = worker.run_once(bad, {"results": res, "status": st}, ov, None)
    st["publish_every_s"] = 60
    st["rehearsal"] = True
    out.mkdir(parents=True, exist_ok=True)
    (out / "rehearsal.json").write_text(json.dumps({"results": res, "status": st, "rehearsal": True}, separators=(",", ":")))
    print(f"rehearsal feed: {len(res['races'])} races from {len(by_state)} states, AK feed down, 1 hand entry")


def rehearse(out: Path, steps: int = 12) -> None:
    final = alaska.parse((FIXTURES / "ak_2024.csv").read_text(), 2024)
    rp = Replay(final)
    prev = None
    for i in range(steps + 1):
        rp.at(i * 240 / steps)
        res, st = worker.run_once({"AK": rp.read}, prev, json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {})
        worker.write(res, st, out)
        prev = {"results": res, "status": st}
        print(f"minute {i * 240 // steps:>3}: {res['races'][0]['total']:,} votes counted")
    rehearsal_feed(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="live", type=Path)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--rehearse", action="store_true")
    ap.add_argument("--upload", action="store_true", help="publish (R2 if configured, else into the site)")
    ap.add_argument("--every", type=int, default=45)
    ap.add_argument("--hours", type=float, default=5.5)
    a = ap.parse_args()
    if a.rehearse:
        rehearse(a.out)
        if a.upload:
            publish_to_site(a.out, "rehearsal.json")   # a separate file: the public board never shows it unless asked (?rehearsal=1)
        return
    if a.once:
        src, ov, _ = current_config() if os.environ.get("GITHUB_ACTIONS") else (json.loads(SOURCES.read_text()), local_json(OVERRIDES) or {}, [])
        res, st = worker.run_once(readers_from_config(src), None, ov)
        worker.write(res, st, a.out)
        print(json.dumps(st["states"], indent=1))
        if a.upload:
            upload(a.out) if r2_configured() else publish_to_site(a.out)
        return
    prev, end, last_pub = seed_previous(), time.time() + a.hours * 3600, 0.0
    use_r2 = r2_configured()
    print("publishing to:", "Cloudflare R2" if use_r2 else "the site itself (web/public/data/live)")
    while time.time() < end:
        t = time.time()
        src, ov, problems = current_config()
        res, st = worker.run_once(readers_from_config(src), prev, ov)
        st["override_errors"] = list(st.get("override_errors") or []) + problems
        votes = any(r.get("total") for r in res["races"])
        every = publish_every_s(has_votes=votes)
        st["publish_every_s"] = 15 if use_r2 else every
        worker.write(res, st, a.out)
        prev = {"results": res, "status": st}
        if a.upload:
            try:
                if use_r2:
                    upload(a.out)
                elif time.time() - last_pub >= every:
                    publish_to_site(a.out)
                    last_pub = time.time()
            except Exception as ex:  # noqa: BLE001 - keep counting even if publishing hiccups
                print("publish failed:", ex)
        time.sleep(max(1, a.every - (time.time() - t)))


if __name__ == "__main__":
    main()
