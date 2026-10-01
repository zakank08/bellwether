"""One normalized shape for every state feed."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Optional


@dataclass
class Cand:
    name: str
    party: str        # D, R, or O (anyone else, including independents)
    votes: int


@dataclass
class RaceResult:
    race_id: str                      # matches the forecast, e.g. 2026-sen-GA, 2026-house-AK-00
    state: str
    cands: list[Cand]
    units_reporting: int = 0          # precincts or counties that have reported
    units_total: int = 0
    source: str = ""                  # e.g. "Georgia Secretary of State"
    source_url: str = ""
    as_of: Optional[str] = None       # the feed's own timestamp when it has one
    by_hand: Optional[str] = None     # set when a person entered or corrected the numbers

    @property
    def total(self) -> int:
        return sum(c.votes for c in self.cands)

    def to_json(self) -> dict:
        d = asdict(self)
        d["total"] = self.total
        return d


def party_side(label: str) -> str:
    """Map a feed's party text to D / R / O."""
    s = (label or "").strip().lower().strip("()")
    if s in {"d", "dem", "democrat", "democratic", "dfl", "democratic-farmer-labor", "democratic-npl"} or s.startswith("democrat"):
        return "D"
    if s in {"r", "rep", "republican", "gop"} or s.startswith("republican"):
        return "R"
    return "O"


def house_id(year: int, state: str, district: int) -> str:
    return f"{year}-house-{state}-{district:02d}"


def senate_id(year: int, state: str, special: bool = False) -> str:
    return f"{year}-sen-{state}" + ("-sp" if special else "")
