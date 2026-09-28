"""Polls from the VoteHub Polling API (free for researchers/journalists/
developers; attribute VoteHub). Poll types: us-senator, governor,
us-representative, generic-ballot, approval."""
from __future__ import annotations

import re

from ..http import fetch_json
from ..schema import Poll
from ..states import STATES
from .base import PollSource

BASE = "https://api.votehub.com/polls?poll_type={t}"


def _race_key(poll_type: str, subject: str | None, seat: str | None) -> str | None:
    subject = (subject or "").strip()
    if poll_type == "generic-ballot":
        return "generic" if subject == "2026" else None
    m = re.match(r"^2026 (.+)$", subject)
    if not m:
        return None
    rest = m.group(1)
    if poll_type == "us-representative":
        m2 = re.match(r"^([A-Z]{2})-(\d{2}|AL)$", rest)
        if not m2:
            return None
        d = "00" if m2.group(2) == "AL" else m2.group(2)
        return f"house:{m2.group(1)}-{d}"
    # skip party primaries ("2026 Texas Democratic") and specials we can't place
    if rest.endswith((" Democratic", " Republican")):
        return None
    st = STATES.get(rest)
    if not st:
        return None
    office = {"us-senator": "senate", "governor": "governor"}.get(poll_type)
    if seat and "special" in seat.lower():
        return f"{office}:{st}-sp"
    return f"{office}:{st}" if office else None


class VoteHubPolls(PollSource):
    name = "votehub"
    TYPES = ("us-senator", "governor", "us-representative", "generic-ballot")

    def polls(self):
        for t in self.TYPES:
            for p in fetch_json(BASE.format(t=t), max_age_s=3 * 3600):
                key = _race_key(t, p.get("subject"), p.get("seat_name"))
                if not key:
                    continue
                yield self._to_poll(p, key)

    def approval(self, subject="Donald Trump"):
        for p in fetch_json(BASE.format(t="approval"), max_age_s=3 * 3600):
            if p.get("subject") == subject:
                yield self._to_poll(p, "approval:trump")

    @staticmethod
    def _to_poll(p, key) -> Poll:
        return Poll(
            id=f"votehub:{p['id']}", source="VoteHub", race_key=key, pollster=p.get("pollster") or "Unknown",
            start_date=p.get("start_date") or p.get("end_date"), end_date=p.get("end_date"),
            sample_size=int(p["sample_size"]) if p.get("sample_size") not in (None, "") else None,
            population=(p.get("population") or None),
            answers={a["choice"]: float(a["pct"]) for a in p.get("answers", []) if a.get("pct") is not None},
            sponsors=p.get("sponsors") or [], partisan=p.get("partisan"), internal=bool(p.get("internal")),
            url=p.get("url"),
        )
