"""The election-night loop: run every state's reader, check the numbers, apply hand corrections, write two files.

  results.json  one row per race (candidate votes, reporting units, where it came from)
  status.json   per state: last success, errors in a row, anything rejected and why

A reader that fails keeps the state's last good numbers on the page and marks the state "stale" in status.json.
Numbers that look wrong (a vote count that goes down, no candidates, a negative count) are rejected the same way:
the last good numbers stay and the reason is written to status.json. Nothing is ever silently dropped."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from .model import Cand, RaceResult

Reader = Callable[[], list[RaceResult]]


def problems(new: RaceResult, old: RaceResult | None) -> list[str]:
    """Reasons to refuse `new`. Empty means it can be used."""
    out = []
    if not new.cands:
        out.append("no candidates in the feed")
    if any(c.votes < 0 for c in new.cands):
        out.append("a negative vote count")
    if new.units_total and new.units_reporting > new.units_total:
        out.append("more units reporting than exist")
    if old and old.cands and not old.by_hand:
        oldv = {c.name: c.votes for c in old.cands}
        for c in new.cands:
            if c.name in oldv and c.votes < oldv[c.name]:
                out.append(f"{c.name}'s votes went down ({oldv[c.name]:,} to {c.votes:,})")
        if new.total < old.total:
            out.append(f"total votes went down ({old.total:,} to {new.total:,})")
        if new.units_reporting < old.units_reporting:
            out.append(f"fewer units reporting ({old.units_reporting} to {new.units_reporting})")
    return out


def _from_json(d: dict) -> RaceResult:
    return RaceResult(d["race_id"], d["state"], [Cand(c["name"], c["party"], int(c["votes"])) for c in d["cands"]],
                      d.get("units_reporting", 0), d.get("units_total", 0), d.get("source", ""), d.get("source_url", ""),
                      d.get("as_of"), d.get("by_hand"), d.get("counties"))


def check_overrides(ov: dict) -> tuple[list[RaceResult], dict[str, dict], list[str]]:
    """Read data/config/live_overrides.json. Returns (hand-entered results, holds, errors).
    A bad entry is skipped and named in `errors`; it never stops the loop."""
    results, holds, errors = [], {}, []
    for i, e in enumerate(ov.get("results") or []):
        try:
            if not (e.get("reason") and e.get("source")):
                raise ValueError("needs a 'reason' and a 'source'")
            r = RaceResult(e["race_id"], e["race_id"].split("-")[2],
                           [Cand(c["name"], c["party"], int(c["votes"])) for c in e["cands"]],
                           int(e.get("units_reporting", 0)), int(e.get("units_total", 0)),
                           f"Entered by hand from {e['source']}", e.get("source_url", ""), None, f"{e['reason']}")
            if any(c.votes < 0 for c in r.cands) or not r.cands:
                raise ValueError("candidates missing or negative votes")
            results.append(r)
        except Exception as ex:  # noqa: BLE001 - report, never crash on a typo
            errors.append(f"results[{i}] ({e.get('race_id', '?')}): {ex}")
    for i, e in enumerate(ov.get("holds") or []):
        try:
            if not e.get("reason"):
                raise ValueError("needs a 'reason'")
            if e.get("action") not in ("undecided", "decided_dside", "decided_rside"):
                raise ValueError("action must be undecided, decided_dside or decided_rside")
            holds[e["race_id"]] = {"action": e["action"], "reason": e["reason"]}
        except Exception as ex:  # noqa: BLE001
            errors.append(f"holds[{i}] ({e.get('race_id', '?')}): {ex}")
    return results, holds, errors


def run_once(readers: dict[str, Reader], prev: dict | None = None, overrides: dict | None = None,
             now: str | None = None) -> tuple[dict, dict]:
    now = now or datetime.now(timezone.utc).isoformat(timespec="seconds")
    prev = prev or {}
    old_races = {r["race_id"]: _from_json(r) for r in (prev.get("results") or {}).get("races", [])}
    old_status = (prev.get("status") or {}).get("states", {})
    merged: dict[str, RaceResult] = dict(old_races)
    states: dict[str, dict] = {}
    skip = set((overrides or {}).get("pause_states") or [])

    for st, read in readers.items():
        s = dict(old_status.get(st) or {"errors_in_a_row": 0, "last_success": None})
        s["rejected"] = []
        if st in skip:
            s.update(state="paused", message="Paused by hand (see live_overrides.json)")
            states[st] = s
            continue
        try:
            rows = read()
        except Exception as ex:  # noqa: BLE001 - one broken feed must not stop the others
            s["errors_in_a_row"] = int(s.get("errors_in_a_row") or 0) + 1
            s.update(state="stale" if s.get("last_success") else "down", message=f"Feed error: {str(ex)[:160]}")
            states[st] = s
            continue
        accepted = 0
        for r in rows:
            why = problems(r, merged.get(r.race_id))
            if why:
                s["rejected"].append({"race_id": r.race_id, "why": "; ".join(why)})
            else:
                merged[r.race_id] = r
                accepted += 1
        if rows and not accepted:
            s["errors_in_a_row"] = int(s.get("errors_in_a_row") or 0) + 1
            s.update(state="stale", message="Every race in the feed was rejected; showing the last good numbers")
        else:
            s.update(state="ok" if not s["rejected"] else "partial", errors_in_a_row=0, last_success=now,
                     message="" if not s["rejected"] else f"{len(s['rejected'])} race(s) rejected; last good numbers kept",
                     races=accepted)
        states[st] = s

    hand, holds, ov_errors = check_overrides(overrides or {})
    for r in hand:
        merged[r.race_id] = r
    results = {"updated": now, "races": [merged[k].to_json() for k in sorted(merged)], "holds": holds}
    status = {"updated": now, "states": states, "override_errors": ov_errors,
              "by_hand": sorted(r.race_id for r in hand)}
    return results, status


def write(results: dict, status: dict, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for name, obj in (("results.json", results), ("status.json", status)):
        tmp = out / (name + ".tmp")
        tmp.write_text(json.dumps(obj, separators=(",", ":")))
        tmp.replace(out / name)  # atomic, so a visitor never reads half a file


def loop(readers: dict[str, Reader], overrides_path: Path, out: Path, every_s: int = 45, hours: float = 9) -> None:
    prev = None
    end = time.time() + hours * 3600
    while time.time() < end:
        t = time.time()
        try:
            ov = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
        except json.JSONDecodeError as ex:
            ov = {}
            print("live_overrides.json is not valid JSON:", ex)
        results, status = run_once(readers, prev, ov)
        write(results, status, out)
        prev = {"results": results, "status": status}
        time.sleep(max(1, every_s - (time.time() - t)))
