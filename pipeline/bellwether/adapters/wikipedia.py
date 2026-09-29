"""Race lists, candidates, Cook PVI (on 2026 lines) and expert ratings from the
Wikipedia 2026 overview pages (CC BY-SA 4.0 — attributed on the site).

Wikipedia is used for *race structure* (who is running where, and on which
district lines), never for poll numbers or results.
"""
from __future__ import annotations

import io
import json
import re

import pandas as pd

from ..http import fetch
from ..schema import Candidate, Race, party_code
from ..states import NAMES, RCV_GENERAL, RUNOFF_GENERAL, STATES, TOP_TWO
from .base import RaceSource

API = "https://en.wikipedia.org/w/api.php?action=parse&page={page}&prop=text&format=json&formatversion=2"
PAGES = {
    "senate": "2026_United_States_Senate_elections",
    "governor": "2026_United_States_gubernatorial_elections",
    "house": "2026_United_States_House_of_Representatives_elections",
}
CAND_RE = re.compile(r"▌\s*([^▌(]+?)\s*\(([^)]+)\)")
REF_RE = re.compile(r"\[[^\]]*\]")

# Short labels for rating columns (ratings are shown as a comparison layer
# with attribution only; see methodology on licensing).
RATER_ALIASES = {"Cook": "Cook", "IE": "Inside Elections", "Sabato": "Sabato", "DDHQ": "DDHQ",
                 "Econ": "The Economist", "FPO": "Split Ticket/FPO", "Fox": "Fox News", "RCP": "RCP",
                 "Silver": "Silver Bulletin", "ST": "Split Ticket", "CNalysis": "CNalysis", "Race to the WH": "Race to the WH"}


def page_html(page: str) -> str:
    raw = fetch(API.format(page=page), max_age_s=6 * 3600)
    return json.loads(raw)["parse"]["text"]


def tables(page: str) -> list[pd.DataFrame]:
    return pd.read_html(io.StringIO(page_html(page)))


def link_map(page: str) -> dict[str, str]:
    """Anchor text -> article title for every internal link on the page, so
    candidates can be linked to their own Wikipedia articles."""
    from urllib.parse import unquote
    out: dict[str, str] = {}
    for href, text in re.findall(r'<a href="/wiki/([^"#?]+)"[^>]*>([^<]{3,80})</a>', page_html(page)):
        if ":" in href:
            continue
        t = clean(text)
        if t and t not in out:
            out[t] = unquote(href).replace("_", " ")
    return out


def attach_links(races, page: str):
    lm = link_map(page)
    for r in races:
        for c in r.candidates:
            t = lm.get(c.name)
            # skip red links and links to the election page itself
            if t and "election" not in t.lower():
                c.wiki = t
    return races


def clean(s) -> str:
    if not isinstance(s, str):
        return ""
    return REF_RE.sub("", s).replace("\xa0", " ").strip()


def parse_pvi(s) -> float | None:
    s = clean(s).upper()
    if not s:
        return None
    if s.startswith("EVEN"):
        return 0.0
    m = re.match(r"([DR])\+(\d+(?:\.\d+)?)", s)
    if not m:
        return None
    v = float(m.group(2))
    return v if m.group(1) == "D" else -v


def parse_candidates(cell, incumbent_name: str | None) -> list[Candidate]:
    out = []
    for name, party in CAND_RE.findall(clean(cell)):
        name = clean(name)
        out.append(Candidate(name=name, party=party_code(party), party_label=party.strip()))
    if incumbent_name:
        exact = [c for c in out if c.name == incumbent_name]
        fuzzy = [c for c in out if _same_person(c.name, incumbent_name)]
        pick = exact if exact else (fuzzy if len(fuzzy) == 1 else [])
        for c in pick:
            c.incumbent = True
    return out


def _same_person(a: str, b: str) -> bool:
    norm = lambda x: re.sub(r"[^a-z ]", "", x.lower().replace(".", "")).split()
    a, b = norm(a), norm(b)
    return bool(a) and bool(b) and a[-1] == b[-1] and a[0][0] == b[0][0]


def _flat(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [" | ".join(dict.fromkeys(str(x) for x in c)) if isinstance(c, tuple) else str(c) for c in df.columns]
    return df


def _col(df, *needles):
    for c in df.columns:
        if all(n.lower() in c.lower() for n in needles):
            return c
    return None


def _state_from(label: str):
    label = clean(label)
    special = "special" in label.lower() or "class 3" in label.lower()
    base = re.sub(r"\s*\(.*?\)", "", label).strip()
    return STATES.get(base), special


def _rules(state: str) -> dict:
    return {"rcv": state in RCV_GENERAL, "runoff": state in RUNOFF_GENERAL, "top_two": state in TOP_TWO,
            "top_four": state == "AK"}


def _ratings(row, df) -> dict:
    out = {}
    for c in df.columns:
        if c.startswith("Ratings |"):
            key = clean(c.split("|", 1)[1]).split(" ")[0]
            v = clean(row[c])
            if v and v.lower() != "nan":
                out[RATER_ALIASES.get(key, key)] = v
    return out


class WikipediaRaces(RaceSource):
    name = "wikipedia"

    def races(self) -> list[Race]:
        return (attach_links(self.senate(), PAGES["senate"]) + attach_links(self.governors(), PAGES["governor"])
                + attach_links(self.house(), PAGES["house"]))

    # ---- Senate -------------------------------------------------------------
    def senate(self) -> list[Race]:
        ts = [_flat(t) for t in tables(PAGES["senate"])]
        ratings = next(t for t in ts if _col(t, "Ratings") and _col(t, "Constituency", "State") and len(t) > 30)
        cand_tables = [t for t in ts if _col(t, "Candidates") and _col(t, "Incumbent", "Senator") and _col(t, "Party")]
        close = next((t for t in ts if _col(t, "Poll closing")), None)
        close_map = {}
        if close is not None:
            for _, r in close.iterrows():
                st = STATES.get(clean(r[_col(close, "State")]))
                if st:
                    close_map[st] = clean(r[_col(close, "Poll closing")])
        rat_map = {}
        for _, r in ratings.iterrows():
            st, special = _state_from(r[_col(ratings, "State")])
            if st:
                rat_map[(st, special)] = (parse_pvi(r[_col(ratings, "PVI")]), _ratings(r, ratings),
                                          clean(r[_col(ratings, "Last election")]))
        races = []
        for t in cand_tables:
            is_special_table = any("Class 3" in clean(x) for x in t[_col(t, "State")])
            for _, r in t.iterrows():
                st, special = _state_from(r[_col(t, "State")])
                if not st:
                    continue
                special = special or is_special_table
                inc = clean(r[_col(t, "Senator")])
                inc = re.sub(r"\s*\(.*?\)", "", inc)
                status = clean(r[_col(t, "Status")] if _col(t, "Status") else r[_col(t, "Results")])
                pvi, rts, last = rat_map.get((st, special), (None, {}, ""))
                race = Race(
                    id=f"2026-sen-{st}" + ("-sp" if special else ""), cycle=2026, office="senate", state=st,
                    state_name=NAMES[st], special=special, incumbent=inc,
                    incumbent_party=party_code(clean(r[_col(t, "Incumbent", "Party")])),
                    open_seat=bool(re.search(r"retir|lost renomination|resign|ran for|running for|defeated", status, re.I))
                    and not re.search(r"advanced|renominated|nominated", status, re.I),
                    pvi=pvi, candidates=parse_candidates(r[_col(t, "Candidates")], inc), ratings=rts,
                    rules=_rules(st), poll_close_et=close_map.get(st),
                )
                if last:
                    race.notes.append(f"Last election: {last}")
                if status:
                    race.notes.append(status)
                races.append(race)
        return races

    # ---- Governors ----------------------------------------------------------
    def governors(self) -> list[Race]:
        ts = [_flat(t) for t in tables(PAGES["governor"])]
        ratings = next(t for t in ts if _col(t, "Ratings") and _col(t, "Constituency", "State"))
        cands = next(t for t in ts if _col(t, "Candidates") and list(t.columns)[0] == "State")
        rat_map = {}
        for _, r in ratings.iterrows():
            st, _ = _state_from(r[_col(ratings, "State")])
            if st:
                rat_map[st] = (parse_pvi(r[_col(ratings, "PVI")]), _ratings(r, ratings))
        races = []
        for _, r in cands.iterrows():
            st, _ = _state_from(r["State"])
            if not st:
                continue
            inc = re.sub(r"\s*\(.*?\)", "", clean(r["Governor"]))
            status = clean(r["Status"])
            pvi, rts = rat_map.get(st, (None, {}))
            races.append(Race(
                id=f"2026-gov-{st}", cycle=2026, office="governor", state=st, state_name=NAMES[st],
                incumbent=inc, incumbent_party=party_code(clean(r["Party"])),
                open_seat=bool(re.search(r"term-limited|retir|lost renomination|resign|running for|ran for|defeated", status, re.I))
                and not re.search(r"renominated|nominated|advanced", status, re.I),
                pvi=pvi, candidates=parse_candidates(r["Candidates"], inc), ratings=rts, rules=_rules(st),
                notes=[status] if status else [],
            ))
        return races

    # ---- House --------------------------------------------------------------
    def house(self) -> list[Race]:
        ts = [_flat(t) for t in tables(PAGES["house"])]
        races = []
        for t in ts:
            loc, cand, pvi = _col(t, "District", "Location"), _col(t, "Candidates"), _col(t, "PVI")
            if not (loc and cand and _col(t, "Incumbent", "Member")):
                continue
            for _, r in t.iterrows():
                label = clean(r[loc])
                m = re.match(r"(.+?)\s+(\d+|at-large|AL)$", label, re.I)
                if not m or m.group(1) not in STATES:
                    continue
                st = STATES[m.group(1)]
                dist = 0 if not m.group(2).isdigit() else int(m.group(2))
                inc = re.sub(r"\s*\(.*?\)", "", clean(r[_col(t, "Incumbent", "Member")]))
                inc = re.split(r"\s+Redistricted from", inc)[0].strip()
                status = clean(r[_col(t, "Incumbent", "Status")]) if _col(t, "Incumbent", "Status") else ""
                vacant = inc.lower().startswith("vacant")
                races.append(Race(
                    id=f"2026-house-{st}-{dist:02d}", cycle=2026, office="house", state=st, state_name=NAMES[st],
                    district=dist, incumbent=None if vacant else inc,
                    incumbent_party=None if vacant else party_code(clean(r[_col(t, "Incumbent", "Party")])),
                    open_seat=vacant or bool(re.search(r"retir|lost renomination|resign|running for|ran for|defeated|new seat|moved", status, re.I))
                    and not re.search(r"renominated|advanced", status, re.I),
                    pvi=parse_pvi(r[pvi]) if pvi else None,
                    candidates=parse_candidates(r[cand], inc), rules=_rules(st),
                    notes=[status] if status else [],
                ))
                if re.search(r"re-?elected|unopposed", status, re.I) and len(races[-1].candidates) <= 1:
                    races[-1].notes.append("Uncontested: no opponent on the general-election ballot.")
                if st == "LA":
                    races[-1].notes.append("Louisiana House: all-party primary on Nov. 3; runoff Dec. 12 if no one tops 50%.")
                    races[-1].rules["jungle_nov"] = True
        # de-duplicate (a district can appear in more than one table)
        seen, out = set(), []
        for r in races:
            if r.id not in seen:
                seen.add(r.id)
                out.append(r)
        return out
