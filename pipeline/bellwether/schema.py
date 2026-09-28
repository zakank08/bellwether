"""Common schema every adapter writes into. Plain dataclasses -> JSON."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Optional

PARTY_CODES = {
    "Democratic": "D", "Democratic–Farmer–Labor": "D", "Democratic-NPL": "D", "DFL": "D", "Democratic–NPL": "D",
    "Republican": "R", "Independent": "I", "Libertarian": "L", "Green": "G",
}


def party_code(label: str) -> str:
    label = label.strip()
    if label in PARTY_CODES:
        return PARTY_CODES[label]
    if label.startswith("Democratic"):
        return "D"
    if label.startswith("Republican"):
        return "R"
    return "O"  # other / minor party


@dataclass
class Candidate:
    name: str
    party: str            # D, R, I, L, G, O
    party_label: str
    incumbent: bool = False


@dataclass
class Race:
    id: str               # 2026-sen-GA, 2026-sen-FL-sp, 2026-gov-GA, 2026-house-GA-07
    cycle: int
    office: str           # senate | governor | house
    state: str            # USPS code
    state_name: str
    district: Optional[int] = None   # 0 = at-large
    special: bool = False
    incumbent: Optional[str] = None
    incumbent_party: Optional[str] = None
    open_seat: bool = False
    pvi: Optional[float] = None      # Cook PVI, + = Dem lean, in points
    last_margin: Optional[float] = None  # last result for this seat, D minus R
    candidates: list[Candidate] = field(default_factory=list)
    ratings: dict[str, str] = field(default_factory=dict)
    rules: dict[str, bool] = field(default_factory=dict)  # rcv, runoff, top_two, top_four
    poll_close_et: Optional[str] = None
    notes: list[str] = field(default_factory=list)

    def to_json(self):
        return asdict(self)


@dataclass
class Poll:
    id: str
    source: str
    race_key: str          # e.g. "senate:GA", "governor:GA", "house:AK-01", "generic", "approval:trump"
    pollster: str
    start_date: str
    end_date: str
    sample_size: Optional[int]
    population: Optional[str]    # lv | rv | a | v
    answers: dict[str, float]    # choice label -> pct
    sponsors: list[str] = field(default_factory=list)
    partisan: Optional[str] = None   # sponsor partisanship flag: D | R | None
    internal: bool = False
    url: Optional[str] = None

    def to_json(self):
        return asdict(self)
