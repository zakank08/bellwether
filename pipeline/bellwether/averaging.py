"""Polling averages.

Each poll is turned into a margin (D-side minus R-side, in points) and then:
  1. population-adjusted (RV/adult polls shifted to a likely-voter basis, by an
     amount estimated from the generic-ballot series itself),
  2. house-effect-adjusted (each pollster's persistent lean relative to the
     other pollsters, shrunk toward 0 so a pollster needs many polls to earn one),
  3. timeline-adjusted (older polls shifted by how much the national generic
     ballot has moved since they were taken),
and then averaged with weights for recency, sample size, pollster quality and
pollster frequency (so one prolific pollster can't swamp a race).
"""
from __future__ import annotations

import math
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta

from .schema import Poll, Race

HALF_LIFE_DAYS = 14.0
HOUSE_EFFECT_K = 5.0        # phantom polls at zero house effect
POP_ADJ_K = 20.0
MAX_N = 3000
PARTISAN_SPONSOR_PENALTY = 0.5
TIMELINE_BETA = {"senate": 0.8, "governor": 0.6, "house": 1.0, "generic": 0.0}


def d(s: str) -> date:
    return date.fromisoformat(s[:10])


def _norm_name(n: str) -> list[str]:
    n = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", n.lower())
    return [t for t in re.sub(r"[^a-z\- ]", " ", n).split() if t]


def same_person(poll_choice: str, cand_name: str) -> bool:
    a, b = _norm_name(poll_choice), _norm_name(cand_name)
    if not a or not b:
        return False
    if a[-1] != b[-1]:
        return False
    return len(a) == 1 or len(b) == 1 or a[0][0] == b[0][0]


def match_candidate(choice: str, cands):
    """Candidate a poll answer refers to. Exact name wins; if a short name
    matches several candidates (two 'Dan Sullivan's), the incumbent wins."""
    exact = [c for c in cands if c.name.lower() == choice.lower()]
    if exact:
        return exact[0]
    hits = [c for c in cands if same_person(choice, c.name)]
    if len(hits) == 1:
        return hits[0]
    inc = [c for c in hits if c.incumbent]
    return inc[0] if len(inc) == 1 else None


@dataclass
class Principals:
    d_name: str | None        # the non-Republican principal (D, or an independent)
    d_party: str | None
    r_name: str | None        # the Republican principal (or the second D in a D-vs-D top-two)
    r_party: str | None
    kind: str = "two_party"   # two_party | same_party | uncontested | no_candidates
    candidates: list = field(default_factory=list, repr=False)


def principals(race: Race, polls: list[Poll]) -> Principals:
    pr = _principals(race, polls)
    pr.candidates = race.candidates
    return pr


def _principals(race: Race, polls: list[Poll]) -> Principals:
    cands = race.candidates
    if not cands:
        return Principals(None, None, None, None, "no_candidates")
    if len(cands) == 1:
        c = cands[0]
        return Principals(c.name, c.party, None, None, "uncontested")
    # Poll support for each candidate, when polled head-to-head.
    support = defaultdict(list)
    for p in polls:
        for choice, pct in p.answers.items():
            c = match_candidate(choice, cands)
            if c:
                support[c.name].append(pct)
    avg = {c.name: (sum(support[c.name]) / len(support[c.name]) if support[c.name] else None) for c in cands}
    parties = {c.party for c in cands}
    majors = [c for c in cands if c.party in ("D", "R")]
    if len({c.party for c in majors}) == 1 and len(majors) >= 2 and not any(c.party in ("I",) for c in cands):
        # e.g. California top-two D vs D: party outcome is decided.
        ms = sorted(majors, key=lambda c: -(avg[c.name] or 0))
        return Principals(ms[0].name, ms[0].party, ms[1].name, ms[1].party, "same_party")

    def pick(pool):
        """Principal from a party's candidates: the best-polling one, else the
        incumbent, else the lone candidate, else the party field as a whole
        (e.g. Louisiana's all-party House primary with several Republicans)."""
        if not pool:
            return None
        polled = [c for c in pool if avg[c.name] is not None]
        if polled:
            c = max(polled, key=lambda c: avg[c.name])
            return c.name, c.party
        inc = [c for c in pool if c.incumbent]
        if inc:
            return inc[0].name, inc[0].party
        if len(pool) == 1:
            return pool[0].name, pool[0].party
        party = pool[0].party
        label = {"D": "Democratic", "R": "Republican"}.get(party, "Other")
        return f"{label} field", party

    rep = pick([c for c in cands if c.party == "R"])
    dem = pick([c for c in cands if c.party == "D"])
    if dem is None:  # e.g. Nebraska: the main non-Republican is an independent
        others = [c for c in cands if c.party != "R"]
        dem = pick(sorted(others, key=lambda c: (-(avg[c.name] if avg[c.name] is not None else -1), c.party != "I"))[:1])
    if rep is None:
        others = [c for c in cands if c.party != "D" and (dem is None or c.name != dem[0])]
        rep = pick(sorted(others, key=lambda c: (not c.incumbent, -(avg[c.name] or 0)))[:1])
    if dem is None or rep is None:
        only = dem or rep
        return Principals(only[0] if only else None, only[1] if only else None, None, None, "uncontested")
    return Principals(dem[0], dem[1], rep[0], rep[1], "two_party")


def poll_margin(poll: Poll, pr: Principals | None) -> float | None:
    """D-side minus R-side margin for a poll, or None if it doesn't test the principals."""
    if pr is None:  # generic ballot
        dv = poll.answers.get("Dem")
        rv = poll.answers.get("Rep")
        return None if dv is None or rv is None else dv - rv
    dv = rv = None
    for choice, pct in poll.answers.items():
        c = match_candidate(choice, pr.candidates) if pr.candidates else None
        name = c.name if c else None
        if name is None:
            continue
        if name == pr.d_name:
            dv = pct
        elif name == pr.r_name:
            rv = pct
    if dv is None or rv is None:
        return None
    return dv - rv


@dataclass
class PollPoint:
    poll: Poll
    raw_margin: float
    margin: float = 0.0          # after all adjustments
    house_effect: float = 0.0
    pop_adj: float = 0.0
    timeline_adj: float = 0.0
    quality: float = 1.0
    rated_as: str | None = None
    weight: float = 0.0


@dataclass
class Average:
    margin: float | None
    se: float | None
    n_eff: float
    n_polls: int
    points: list[PollPoint] = field(default_factory=list)


def recency_weight(age_days: float) -> float:
    return 0.5 ** (max(age_days, 0) / HALF_LIFE_DAYS)


def sample_weight(n: int | None) -> float:
    n = n or 600
    return math.sqrt(min(n, MAX_N) / 600.0)


def weighted_average(points: list[PollPoint], asof: date, window_days: int = 120) -> Average:
    pts = [p for p in points if d(p.poll.end_date) <= asof and (asof - d(p.poll.end_date)).days <= window_days]
    if not pts:
        return Average(None, None, 0.0, 0, [])
    per_pollster = defaultdict(int)
    for p in pts:
        per_pollster[p.poll.pollster] += 1
    ws = []
    for p in pts:
        mid = d(p.poll.start_date) + (d(p.poll.end_date) - d(p.poll.start_date)) / 2
        w = recency_weight((asof - mid).days) * sample_weight(p.poll.sample_size) * p.quality
        if p.poll.partisan or p.poll.internal:
            w *= PARTISAN_SPONSOR_PENALTY
        w /= math.sqrt(per_pollster[p.poll.pollster])
        p.weight = w
        ws.append(w)
    W = sum(ws)
    m = sum(p.weight * p.margin for p in pts) / W
    n_eff = W ** 2 / sum(w * w for w in ws)
    # sampling error of a margin from a ~600 LV poll is ~4 pts; add observed spread
    spread = math.sqrt(sum(p.weight * (p.margin - m) ** 2 for p in pts) / W) if len(pts) > 1 else 4.0
    per_poll = max(spread, 3.5)
    se = per_poll / math.sqrt(max(n_eff, 1.0))
    return Average(m, se, n_eff, len(pts), sorted(pts, key=lambda p: p.poll.end_date))


class PollingModel:
    """Holds every race's poll points and the cross-race adjustments."""

    def __init__(self, ratings_matcher, today: date):
        self.matcher = ratings_matcher
        self.today = today
        self.pop_shift: dict[str, float] = {"lv": 0.0, "v": 0.0, "rv": 0.0, "a": 0.0}
        self.house_effects: dict[str, float] = {}
        self.generic_points: list[PollPoint] = []
        self.race_points: dict[str, list[PollPoint]] = {}
        self.race_office: dict[str, str] = {}
        self._gcache: dict[date, Average] = {}

    # --- building --------------------------------------------------------
    def _point(self, poll: Poll, margin: float) -> PollPoint:
        q, rated = self.matcher.weight(poll.pollster)
        return PollPoint(poll=poll, raw_margin=margin, quality=q, rated_as=rated)

    def add_generic(self, polls: list[Poll]):
        for p in polls:
            m = poll_margin(p, None)
            if m is not None:
                self.generic_points.append(self._point(p, m))

    def add_race(self, race_id: str, office: str, polls: list[Poll], pr: Principals):
        pts = []
        for p in polls:
            m = poll_margin(p, pr)
            if m is not None:
                pts.append(self._point(p, m))
        self.race_points[race_id] = pts
        self.race_office[race_id] = office

    # --- adjustments -----------------------------------------------------
    def estimate_population_shift(self):
        """LV-vs-RV difference, from generic-ballot polls near each other in time."""
        pts = self.generic_points
        diffs = []
        for p in pts:
            pop = (p.poll.population or "lv").lower()
            if pop not in ("rv", "a"):
                continue
            t = d(p.poll.end_date)
            near = [q.raw_margin for q in pts if (q.poll.population or "").lower() in ("lv", "v")
                    and abs((d(q.poll.end_date) - t).days) <= 14]
            if near:
                diffs.append((pop, sum(near) / len(near) - p.raw_margin))
        for pop in ("rv", "a"):
            ds = [x for k, x in diffs if k == pop]
            self.pop_shift[pop] = sum(ds) / (len(ds) + POP_ADJ_K) if ds else 0.0

    def _apply_pop(self, p: PollPoint):
        p.pop_adj = self.pop_shift.get((p.poll.population or "lv").lower(), 0.0)

    def estimate_house_effects(self, iterations: int = 3):
        groups = [self.generic_points] + list(self.race_points.values())
        for pts in groups:
            for p in pts:
                self._apply_pop(p)
        he: dict[str, float] = defaultdict(float)
        for _ in range(iterations):
            resid = defaultdict(list)
            for pts in groups:
                if len(pts) < 3:
                    continue
                for p in pts:
                    p.margin = p.raw_margin + p.pop_adj - he[p.poll.pollster]
                for p in pts:
                    # compare against polls within 30 days from other pollsters
                    t = d(p.poll.end_date)
                    peers = [q.margin for q in pts if q.poll.pollster != p.poll.pollster
                             and abs((d(q.poll.end_date) - t).days) <= 30]
                    if len(peers) >= 2:
                        resid[p.poll.pollster].append(p.raw_margin + p.pop_adj - sum(peers) / len(peers))
            he = defaultdict(float, {k: sum(v) / (len(v) + HOUSE_EFFECT_K) for k, v in resid.items()})
        self._gcache.clear()
        self.house_effects = dict(he)
        for pts in groups:
            for p in pts:
                p.house_effect = self.house_effects.get(p.poll.pollster, 0.0)

    def generic_average(self, asof: date | None = None) -> Average:
        asof = asof or self.today
        if asof in self._gcache:
            return self._gcache[asof]
        for p in self.generic_points:
            p.margin = p.raw_margin + p.pop_adj - p.house_effect
        a = weighted_average(self.generic_points, asof, window_days=60)
        self._gcache[asof] = a
        return a

    def race_average(self, race_id: str, asof: date | None = None) -> Average:
        asof = asof or self.today
        office = self.race_office[race_id]
        beta = TIMELINE_BETA.get(office, 0.8)
        g_now = self.generic_average(asof).margin or 0.0
        cache: dict[date, float] = {}
        for p in self.race_points[race_id]:
            t = d(p.poll.end_date)
            if t not in cache:
                cache[t] = self.generic_average(t).margin if t <= asof else g_now
                cache[t] = cache[t] if cache[t] is not None else g_now
            p.timeline_adj = beta * (g_now - cache[t])
            p.margin = p.raw_margin + p.pop_adj - p.house_effect + p.timeline_adj
        return weighted_average(self.race_points[race_id], asof)

    def series(self, race_id: str | None, start: date, end: date, step: int = 1) -> list[dict]:
        out, t = [], start
        while t <= end:
            a = self.generic_average(t) if race_id is None else self.race_average(race_id, t)
            if a.margin is not None:
                out.append({"date": t.isoformat(), "margin": round(a.margin, 2), "se": round(a.se, 2)})
            t += timedelta(days=step)
        return out
