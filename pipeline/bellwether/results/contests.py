"""Turn a feed's contest title into one of our race ids. Every reader uses this, so spelling variants are handled in one place.

Only the 2026 races we forecast are recognised: U.S. Senate (regular or special), governor, and U.S. House by district number.
Anything else (state legislature, ballot measures, president, lieutenant governor on its own) returns None and is ignored."""
from __future__ import annotations

import re

from .model import house_id, senate_id

_HOUSE = re.compile(r"(?:u\.?s\.?|united states)\s+(?:house|representative)s?(?:\s+of\s+representatives)?|representative to the \d+\w* united states congress|congress(?:ional)?", re.I)
_DIST = re.compile(r"district\s*(?:no\.?\s*)?(\d+)|\b(\d+)(?:st|nd|rd|th)\s+(?:congressional\s+)?district", re.I)
_SEN = re.compile(r"(?:u\.?s\.?|united states)\s+senat(?:e|or)", re.I)
_GOV = re.compile(r"\bgovernor\b", re.I)


def classify(title: str, state: str, year: int = 2026) -> str | None:
    t = re.sub(r"\(vote for \d+\)", "", title or "", flags=re.I).strip()
    low = t.lower()
    if re.search(r"\bstate\s+(senat|house|rep)|\bsenate district|\bhouse district|\bassembly|\bdelegate", low) and not _HOUSE.search(t):
        return None  # state legislature
    if _SEN.search(t):
        return senate_id(year, state, special="special" in low or "unexpired" in low)
    if _HOUSE.search(t):
        m = _DIST.search(t)
        if m:
            return house_id(year, state, int(m.group(1) or m.group(2)))
        return house_id(year, state, 0) if re.search(r"at[- ]large", low) or re.fullmatch(r"(?:u\.?s\.?|united states) representative", low) else None
    if _GOV.search(t):
        # "Governor", "Governor/Lieutenant Governor", "Governor & Lt Governor" are the governor race; a lieutenant-governor-only contest is not
        top = re.split(r"\s*(?:/|&|\band\b)\s*", low)[0].strip()
        return f"{year}-gov-{state}" if top == "governor" else None
    return None


def ticket_name(name: str) -> str:
    """Governor tickets come as 'Jane Doe / John Roe' or 'Jane Doe and John Roe': keep the top of the ticket."""
    return re.split(r"\s+(?:/|and|&)\s+", name.strip(), maxsplit=1)[0]
