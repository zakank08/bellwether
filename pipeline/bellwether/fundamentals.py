"""Non-poll inputs: the national environment, partisan lean, incumbency,
fundraising and expert ratings, each turned into an expected margin
(D-side minus R-side, points) with an uncertainty."""
from __future__ import annotations

import math
import re

# Structural prior for a midterm: the president's party usually loses ground,
# more so when the president is unpopular. Fitted by eye to 2006–2022 midterms
# (national House margin for the president's party ~ -3 + 0.4 x net approval);
# residual SD about 4 points. Deliberately weak: generic-ballot polls dominate.
MIDTERM_BASE = -3.0
APPROVAL_SLOPE = 0.4
PRIOR_SD = 4.0
GENERIC_SYSTEMATIC_SD = 2.5    # generic-ballot polling miss, historically ~2–3 pts

INCUMBENCY = {"senate": 3.0, "governor": 4.0, "house": 2.5}   # House value is refit from 2024 results each run
ELASTICITY = {"senate": 1.0, "governor": 0.75, "house": 1.0}
# Fundamentals-only error. Senate/governor values come from the 2018–2022
# backtest grid search (base 7.0 / 8.5 scaled by 1.6); House is refit each run
# from 2024 district results (see house_history.py); 7.0 is the fallback.
FUND_SD = {"senate": 11.2, "governor": 13.6, "house": 7.0}
# Systematic polling error folded into each race's poll estimate (backtest: 3.0).
SYSTEMATIC_SD = 3.0
EXPERT_SD = 6.5

RATING_MARGIN = {
    "safe": 22.0, "solid": 22.0, "likely": 11.0, "lean": 5.0, "tilt": 2.5, "tossup": 0.0, "toss-up": 0.0,
}


def national_prior(net_approval: float | None, president_party: str = "R") -> tuple[float, float]:
    if net_approval is None:
        return 0.0, 6.0
    pres_margin = MIDTERM_BASE + APPROVAL_SLOPE * net_approval
    return (pres_margin if president_party == "D" else -pres_margin), PRIOR_SD


def national_environment(generic_margin, generic_se, net_approval, president_party="R"):
    """Precision-weighted blend of generic-ballot polls and the structural prior."""
    pm, psd = national_prior(net_approval, president_party)
    if generic_margin is None:
        return pm, psd, 0.0
    v_poll = (generic_se or 1.0) ** 2 + GENERIC_SYSTEMATIC_SD ** 2
    w = (1 / v_poll) / (1 / v_poll + 1 / psd ** 2)
    m = w * generic_margin + (1 - w) * pm
    sd = math.sqrt(1 / (1 / v_poll + 1 / psd ** 2))
    return m, sd, w


def race_fundamentals(office: str, pvi: float | None, national: float, dside_incumbent: int,
                      fundraising_adj: float = 0.0) -> tuple[float | None, float]:
    # fundraising_adj: extra adjustments (incumbent history, money), D-minus-R points
    """Expected margin from partisanship + environment + incumbency.

    dside_incumbent: +1 if the D-side principal is the incumbent, -1 if the
    R-side principal is, 0 for open seats.
    Cook PVI is a share-point lean relative to the nation, so the margin
    difference is about twice the PVI.
    """
    if pvi is None:
        return None, 12.0
    m = ELASTICITY[office] * 2 * pvi + national + INCUMBENCY[office] * dside_incumbent + fundraising_adj
    return m, FUND_SD[office]


def rating_to_margin(label: str) -> float | None:
    s = label.lower().strip()
    m = re.match(r"(safe|solid|likely|lean|tilt)\s+([dri])", s)
    if s.startswith("toss"):
        return 0.0
    if not m:
        return None
    v = RATING_MARGIN[m.group(1)]
    return v if m.group(2) == "d" else -v if m.group(2) == "r" else None


def expert_consensus(ratings: dict[str, str]) -> float | None:
    vals = [v for v in (rating_to_margin(x) for x in ratings.values()) if v is not None]
    return sum(vals) / len(vals) if vals else None


FUNDRAISING_PER_DOUBLING = 0.75
FUNDRAISING_CAP = 2.5


def fundraising_adjustment(d_receipts: float | None, r_receipts: float | None) -> float:
    """~0.75 points per doubling of the receipts ratio, capped at +/-2.5.

    Deliberately small: money partly follows expected competitiveness, so
    much of its signal is already in the polls and partisan lean. Needs at
    least $50k raised on each side so paper candidates don't swing it.
    """
    if not d_receipts or not r_receipts or d_receipts < 50_000 or r_receipts < 50_000:
        return 0.0
    v = FUNDRAISING_PER_DOUBLING * math.log2(d_receipts / r_receipts)
    return max(-FUNDRAISING_CAP, min(FUNDRAISING_CAP, v))


def poll_drift_sd(days_to_election: int) -> float:
    """How much a race's polling average typically moves between now and
    Election Day (random walk, ~0.6 pts x sqrt(days))."""
    return 0.6 * math.sqrt(max(days_to_election, 0))


def blend(poll_margin, poll_se, days, fund_margin, fund_sd, expert_margin=None, use_experts=False,
          systematic_sd=SYSTEMATIC_SD):
    """Precision-weighted blend. Returns (mean, sd, poll_weight)."""
    parts = []
    if poll_margin is not None:
        v = poll_se ** 2 + poll_drift_sd(days) ** 2 + systematic_sd ** 2
        parts.append((poll_margin, v, "poll"))
    if fund_margin is not None:
        parts.append((fund_margin, fund_sd ** 2, "fund"))
    if use_experts and expert_margin is not None:
        parts.append((expert_margin, EXPERT_SD ** 2, "expert"))
    if not parts:
        return None, None, 0.0
    prec = sum(1 / v for _, v, _ in parts)
    mean = sum(m / v for m, v, _ in parts) / prec
    wp = sum(1 / v for _, v, k in parts if k == "poll") / prec
    return mean, math.sqrt(1 / prec), wp
