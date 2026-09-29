"""National polls entered from pollsters' own releases (data/config/national_polls.json).

VoteHub is the main poll feed, but after June 2026 it stopped carrying most
presidential-approval and generic-ballot polls. These are collected by hand
from each pollster's release, each with a link. A poll VoteHub already has
(same pollster, same question, end dates within a day) is skipped, so the file
can overlap VoteHub without double-counting.
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

from ..schema import Poll

PATH = Path(__file__).resolve().parents[3] / "data" / "config" / "national_polls.json"
KEYS = {"approval": "approval:trump", "generic": "generic"}


def _norm(pollster: str) -> str:
    """'CNN/SSRS' and 'SSRS', 'Marist College' and 'Marist University' compare equal."""
    s = re.sub(r"\b(university|college|research|insights|the|inc|llc|co|company)\b", " ", pollster.lower())
    toks = [t for t in re.split(r"[^a-z]+", s) if t and t not in ("cnn", "news", "economist")]
    return " ".join(sorted(toks))


def load(path: Path = PATH) -> list[Poll]:
    if not path.exists():
        return []
    out = []
    for i, p in enumerate(json.loads(path.read_text())["polls"]):
        out.append(Poll(
            id=f"curated:{p['pollster']}:{p['end_date']}:{p['question']}:{i}", source="Pollster release",
            race_key=KEYS[p["question"]], pollster=p["pollster"], start_date=p["start_date"], end_date=p["end_date"],
            sample_size=p.get("sample_size"), population=p.get("population"), answers=dict(p["answers"]),
            sponsors=p.get("sponsors") or [], partisan=p.get("partisan"), internal=bool(p.get("internal")), url=p["url"]))
    return out


def merge(feed: list[Poll], extra: list[Poll]) -> tuple[list[Poll], int]:
    """Add the hand-entered polls that the feed doesn't already have. Returns (polls, n_added)."""
    have = {}
    for p in feed:
        have.setdefault((p.race_key, _norm(p.pollster)), []).append(date.fromisoformat(p.end_date))
    added = []
    for p in extra:
        seen = have.get((p.race_key, _norm(p.pollster)), [])
        if any(abs((d - date.fromisoformat(p.end_date)).days) <= 1 for d in seen):
            continue
        added.append(p)
    return feed + added, len(added)
