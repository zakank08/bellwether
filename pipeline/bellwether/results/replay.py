"""Rehearsal: release a finished election (2024 files) in slow motion through the real worker path.

`Replay(final_rows, start, minutes_per_second)` returns what a live feed would show `minutes` after `start`:
each race's votes and reporting units scaled by an S-shaped curve, so the same code that will read the real feeds
(checks, stale handling, hand corrections, files) runs end to end. A feed can be told to fail, send junk, or send
a vote count that goes down, to rehearse those problems."""
from __future__ import annotations

import copy
import zlib

from .model import RaceResult


def curve(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


class Replay:
    def __init__(self, final: list[RaceResult], hours: float = 4.0):
        self.final, self.hours, self.minute = final, hours, 0.0
        self.fault: str | None = None   # None | "down" | "junk" | "decrease"

    def at(self, minute: float) -> None:
        self.minute = minute

    def read(self) -> list[RaceResult]:
        if self.fault == "down":
            raise RuntimeError("HTTP 503 from the state site (rehearsal)")
        out = []
        for r in self.final:
            # each race starts a little differently, so races do not all move in lockstep
            jitter = (zlib.crc32(r.race_id.encode()) % 40) / 100
            f = curve((self.minute / 60 / self.hours) - jitter * 0.25)
            n = copy.deepcopy(r)
            for c in n.cands:
                c.votes = int(c.votes * f)
            n.units_reporting = int(r.units_total * f)
            if self.fault == "junk":
                n.cands = []
            elif self.fault == "decrease" and n.cands:
                n.cands[0].votes = max(0, n.cands[0].votes // 2)
            out.append(n)
        return out
