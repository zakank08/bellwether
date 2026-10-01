"""Command line for election night.

  python -m bellwether.results.run --once --out /tmp/live            one pass, write the two files
  python -m bellwether.results.run --loop --upload                   the election-night loop, pushing to storage
  python -m bellwether.results.run --rehearse --out /tmp/live        replay 2024 files in fast motion (no network)

Which feeds to read comes from data/config/live_sources.json (a state is only read once its 2026 election exists)."""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from . import alaska, enhanced_voting, north_carolina, worker
from .replay import Replay

ROOT = Path(__file__).resolve().parents[3]
SOURCES = ROOT / "data" / "config" / "live_sources.json"
OVERRIDES = ROOT / "data" / "config" / "live_overrides.json"
FIXTURES = ROOT / "pipeline" / "tests" / "fixtures" / "results"


def readers_from_config() -> dict:
    cfg = json.loads(SOURCES.read_text())
    out = {}
    for st, c in cfg["states"].items():
        if not c.get("election"):
            continue  # not published yet
        kind = c["reader"]
        if kind == "alaska":
            out[st] = lambda c=c: alaska.fetch(c["election"], cfg["year"])
        elif kind == "north_carolina":
            out[st] = lambda c=c: north_carolina.fetch(c["election"], cfg["year"])
        elif kind == "enhanced_voting":
            out[st] = lambda st=st, c=c: enhanced_voting.fetch(st, c["election"], cfg["year"])
    return out


def upload(out: Path) -> None:
    """Copy the two files to a Cloudflare R2 bucket (S3-compatible). Keys come from GitHub secrets, never from code."""
    import boto3  # installed by the workflow
    s3 = boto3.client("s3", endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
                      aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                      region_name="auto")
    for name in ("results.json", "status.json"):
        s3.put_object(Bucket=os.environ["R2_BUCKET"], Key=f"live/{name}", Body=(out / name).read_bytes(),
                      ContentType="application/json", CacheControl="public, max-age=10")


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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="live", type=Path)
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", action="store_true")
    ap.add_argument("--rehearse", action="store_true")
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--every", type=int, default=45)
    ap.add_argument("--hours", type=float, default=5.5)
    a = ap.parse_args()
    if a.rehearse:
        return rehearse(a.out)
    readers = readers_from_config()
    if a.once:
        ov = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
        res, st = worker.run_once(readers, None, ov)
        worker.write(res, st, a.out)
        print(json.dumps(st["states"], indent=1))
        if a.upload:
            upload(a.out)
        return
    prev, end = None, time.time() + a.hours * 3600
    while time.time() < end:
        t = time.time()
        try:
            ov = json.loads(OVERRIDES.read_text()) if OVERRIDES.exists() else {}
        except json.JSONDecodeError:
            ov = {}
        res, st = worker.run_once(readers, prev, ov)
        worker.write(res, st, a.out)
        prev = {"results": res, "status": st}
        if a.upload:
            try:
                upload(a.out)
            except Exception as ex:  # noqa: BLE001 - keep counting even if storage hiccups
                print("upload failed:", ex)
        time.sleep(max(1, a.every - (time.time() - t)))


if __name__ == "__main__":
    main()
