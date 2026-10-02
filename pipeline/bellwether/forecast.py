"""Run the full forecast: ingest -> average -> blend -> simulate -> summarize."""
from __future__ import annotations

from bisect import bisect_left, bisect_right

import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date

import numpy as np

from . import ELECTION_DATE
from .candidate_history import incumbent_effect
from .averaging import HOUSE_EFFECT_K, Average, PollingModel, PollPoint, principals, weighted_average, d as to_date
from . import fundamentals as F
from .fundamentals import (ELASTICITY, blend, expert_consensus, fundraising_adjustment, national_environment,
                           race_fundamentals)
from .pollster_ratings import Matcher, compute as compute_ratings
from .schema import Poll, Race
from .simulate import simulate
from .states import REGION

VERSIONS = ("polls", "fundamentals", "experts")
VERSION_LABELS = {"polls": "Polls only", "fundamentals": "Polls + fundamentals", "experts": "Polls + fundamentals + experts"}
DEFAULT_VERSION = "fundamentals"

# Seats not up in 2026 (Wikipedia, 2026 Senate elections summary table).
SENATE_NOT_UP = {"D": 32, "R": 31, "I_caucus_D": 2}
SENATE_MAJORITY = 51
HOUSE_MAJORITY = 218
VICE_PRESIDENT_PARTY = "R"
PRESIDENT_PARTY = "R"


def rating_bucket(p_dside: float, dparty: str, rparty: str) -> str:
    """Probability -> rating step used for map colour."""
    p = p_dside
    lead, q = (dparty, p) if p >= 0.5 else (rparty, 1 - p)
    side = "d" if lead == "D" else "r" if lead == "R" else "i"
    if q >= 0.95:
        return f"{side}-safe"
    if q >= 0.75:
        return f"{side}-likely"
    if q >= 0.60:
        return f"{side}-lean"
    return "tossup"


@dataclass
class Inputs:
    races: list[Race]
    polls: list[Poll]
    approval_polls: list[Poll]
    demographics: dict
    today: date


def _race_key(r: Race) -> str:
    if r.office == "house":
        return f"house:{r.state}-{r.district:02d}"
    return f"{r.office}:{r.state}" + ("-sp" if r.special else "")


def _zscores(demo: dict) -> dict:
    out = defaultdict(dict)
    for f in ("college", "hispanic", "black"):
        vals = [v[f] for v in demo.values() if v.get(f) is not None]
        mu, sd = float(np.mean(vals)), float(np.std(vals)) or 1.0
        for st, v in demo.items():
            if v.get(f) is not None:
                out[st][f] = (v[f] - mu) / sd
    return out


def _approval_key(p: Poll) -> str:
    """Pollsters differ by who they ask (adults vs registered vs likely voters) as well as by lean."""
    return f"{p.pollster}|{(p.population or 'a').lower()}"


def approval_house_effects(polls: list[Poll], k: float = HOUSE_EFFECT_K, window_days: int = 14, iterations: int = 3) -> dict[str, float]:
    """How far above/below its peers each pollster (and population) runs on net approval.

    Each poll is compared with the average of other pollsters' polls within
    `window_days`; the mean gap is shrunk toward zero by k phantom polls, and the
    comparison is repeated using already-corrected peers. Mirrors the generic-ballot
    house effects, which is why a run of unusually mild polls no longer drags the line."""
    pts = []
    for p in polls:
        a, dis = p.answers.get("Approve"), p.answers.get("Disapprove")
        if a is not None and dis is not None:
            pts.append((to_date(p.end_date).toordinal(), a - dis, _approval_key(p), p.pollster))
    pts.sort()
    days = [x[0] for x in pts]
    he: dict[str, float] = defaultdict(float)
    for _ in range(iterations):
        resid = defaultdict(list)
        for i, (t, m, key, pollster) in enumerate(pts):
            lo, hi = bisect_left(days, t - window_days), bisect_right(days, t + window_days)
            peers = [q[1] - he[q[2]] for q in pts[lo:hi] if q[3] != pollster]
            if len(peers) >= 3:
                resid[key].append(m - sum(peers) / len(peers))
        he = defaultdict(float, {key: sum(v) / (len(v) + k) for key, v in resid.items()})
    return dict(he)


def approval_average(polls: list[Poll], matcher, today: date, effects: dict[str, float] | None = None) -> Average:
    pts = []
    for p in polls:
        a, dis = p.answers.get("Approve"), p.answers.get("Disapprove")
        if a is None or dis is None:
            continue
        q, rated = matcher.weight(p.pollster)
        pt = PollPoint(poll=p, raw_margin=a - dis, quality=q, rated_as=rated)
        pt.house_effect = (effects or {}).get(_approval_key(p), 0.0)
        pt.margin = pt.raw_margin - pt.house_effect
        pts.append(pt)
    return weighted_average(pts, today, window_days=45)


class Forecast:
    def __init__(self, inputs: Inputs, n_sims: int = 40000, seed: int = 2026):
        self.inp = inputs
        self.n_sims = n_sims
        self.seed = seed
        self.today = inputs.today
        self.days = (to_date(ELECTION_DATE) - self.today).days
        self.ratings = compute_ratings()
        self.matcher = Matcher(self.ratings)
        self.zs = _zscores(inputs.demographics)
        self.approval_effects = approval_house_effects([p for p in inputs.approval_polls if to_date(p.end_date) <= self.today])
        self.fundraising: dict[str, dict] = {}
        # Calibrate House fundamentals against 2024 district results (unchanged-lines states).
        self.house_cal = None
        self.incumbency = dict(F.INCUMBENCY)   # per-run copies: the House values are refit below
        self.fund_sd = dict(F.FUND_SD)
        try:
            from .house_history import calibrate
            cal = calibrate(inputs.races)
            if cal["n"] >= 100:
                self.house_cal = cal
                self.incumbency["house"] = max(1.5, min(5.0, cal["incumbency"]))
                self.fund_sd["house"] = round((cal["resid_sd"] ** 2 + 3.5 ** 2) ** 0.5, 2)
        except Exception as e:  # never block the forecast on a calibration source
            print("house calibration skipped:", e)

    def load_fundraising(self, source, only_competitive: bool = True):
        """Fetch FEC totals for Senate races and House races within ~20 points."""
        if not getattr(source, "enabled", False):
            return
        rows, _ = self.race_inputs()
        for row in rows:
            r, pr = row["race"], row["pr"]
            if row["kind"] != "two_party" or r.office not in ("senate", "house"):
                continue
            m = row["est"]["fundamentals"][0]
            if only_competitive and r.office == "house" and (m is None or abs(m) > 20):
                continue
            got = source.race(r.office, r.state, r.district, pr.d_name, pr.r_name)
            if got:
                self.fundraising[r.id] = got

    # ------------------------------------------------------------------
    def build_polling(self):
        pm = PollingModel(self.matcher, self.today)
        pm.add_generic([p for p in self.inp.polls if p.race_key == "generic"])
        by_key = defaultdict(list)
        for p in self.inp.polls:
            by_key[p.race_key].append(p)
        keys = {_race_key(r) for r in self.inp.races}
        # Polls filed under "senate:FL" belong to the FL special when there's no regular race.
        for k in list(by_key):
            if k not in keys and f"{k}-sp" in keys:
                by_key[f"{k}-sp"].extend(by_key.pop(k))
        self.principals = {}
        for r in self.inp.races:
            ps = [p for p in by_key.get(_race_key(r), []) if to_date(p.end_date) <= self.today]
            pr = principals(r, ps)
            self.principals[r.id] = pr
            pm.add_race(r.id, r.office, ps, pr)
        pm.estimate_population_shift()
        pm.estimate_house_effects()
        self.pm = pm
        return pm

    # ------------------------------------------------------------------
    def race_inputs(self, asof: date | None = None):
        asof = asof or self.today
        days = (to_date(ELECTION_DATE) - asof).days
        g = self.pm.generic_average(asof)
        appr = approval_average([p for p in self.inp.approval_polls if to_date(p.end_date) <= asof], self.matcher, asof, self.approval_effects)
        nat, nat_sd, nat_w = national_environment(g.margin, g.se, appr.margin, PRESIDENT_PARTY)
        from .fundamentals import poll_drift_sd
        nat_sd_total = math.sqrt(nat_sd ** 2 + (0.4 * poll_drift_sd(days)) ** 2)
        rows = []
        for r in self.inp.races:
            pr = self.principals[r.id]
            row = {"race": r, "pr": pr, "kind": pr.kind}
            if pr.kind in ("uncontested", "same_party", "no_candidates"):
                rows.append(row)
                continue
            avg = self.pm.race_average(r.id, asof)
            dside_inc = 0
            inc_eff = None
            for c in r.candidates:
                if c.incumbent:
                    dside_inc = 1 if c.name == pr.d_name else -1 if c.name == pr.r_name else 0
                    if dside_inc and r.office in ("senate", "governor") and c.party in ("D", "R"):
                        inc_eff = incumbent_effect(r.state, c.name, c.party)
                    elif dside_inc and r.office == "house" and self.house_cal:
                        from .house_history import incumbent_effect as house_effect
                        inc_eff = house_effect(r, self.house_cal)
            money = self.fundraising.get(r.id)
            d_money, r_money = ((money or {}).get(k) or {} for k in ("d", "r"))
            money_adj = fundraising_adjustment(d_money.get("receipts"), r_money.get("receipts"))
            fund, fsd = race_fundamentals(r.office, r.pvi, nat, dside_inc,
                                          fundraising_adj=(inc_eff["carry"] if inc_eff else 0.0) + money_adj,
                                          incumbency=self.incumbency, fund_sd=self.fund_sd)
            exp = expert_consensus(r.ratings)
            ests = {}
            for v in VERSIONS:
                if v == "polls":
                    # Polls-only: polls when they exist; otherwise the partisan-lean baseline
                    m, s, w = blend(avg.margin, avg.se, days, None if avg.margin is not None else fund, fsd)
                else:
                    m, s, w = blend(avg.margin, avg.se, days, fund, fsd, exp, use_experts=(v == "experts"))
                ests[v] = (m, s, w)
            row.update(avg=avg, fund=fund, fund_sd=fsd, expert=exp, est=ests, dside_inc=dside_inc, inc_eff=inc_eff,
                       money=money, money_adj=money_adj)
            rows.append(row)
        return rows, {"national": nat, "national_sd": nat_sd_total, "generic": g, "approval": appr,
                      "generic_weight": nat_w, "days": days}

    # ------------------------------------------------------------------
    def run(self, asof: date | None = None, n_sims: int | None = None, versions=VERSIONS):
        rows, env = self.race_inputs(asof)
        n_sims = n_sims or self.n_sims
        sim_rows = [r for r in rows if r["kind"] == "two_party" and r["est"][DEFAULT_VERSION][0] is not None]
        results = {}
        for v in versions:
            spec = []
            for r in sim_rows:
                m, s, w = r["est"][v]
                race = r["race"]
                spec.append({"mean": m, "sd": s, "state": race.state, "region": REGION[race.state],
                             "poll_weight": w, "elasticity": ELASTICITY[race.office], "z": self.zs.get(race.state, {})})
            margins = simulate(spec, n_sims, env["national_sd"], seed=self.seed)
            results[v] = self._summarize(rows, sim_rows, margins)
            if v == DEFAULT_VERSION:
                self.last = {"rows": rows, "sim_rows": sim_rows, "margins": margins}
        return rows, env, results

    # ------------------------------------------------------------------
    def _summarize(self, rows, sim_rows, margins):
        n = margins.shape[0]
        idx = {r["race"].id: j for j, r in enumerate(sim_rows)}
        race_out = {}
        winners = {}  # race id -> array of party codes (as small ints) or fixed party
        for r in rows:
            race, pr = r["race"], r["pr"]
            if r["race"].id in idx:
                col = margins[:, idx[race.id]]
                p = float((col > 0).mean())
                q = np.percentile(col, [10, 50, 90])
                race_out[race.id] = {"p_dside": p, "median": float(q[1]), "p10": float(q[0]), "p90": float(q[2]),
                                     "rating": rating_bucket(p, pr.d_party, pr.r_party)}
                winners[race.id] = (col > 0, pr.d_party, pr.r_party)
            else:
                party = pr.d_party
                race_out[race.id] = {"p_dside": 1.0, "median": None, "p10": None, "p90": None,
                                     "rating": {"D": "d-safe", "R": "r-safe"}.get(party, "i-safe"), "fixed": True}
                winners[race.id] = (np.ones(n, dtype=bool), pr.d_party, pr.r_party)
            # party win probabilities
            dwin, dp, rp = winners[race.id]
            pw = defaultdict(float)
            share = float(dwin.mean())
            pw[dp] += share
            if rp:
                pw[rp] += 1 - share
            race_out[race.id]["p_party"] = {k: round(v, 4) for k, v in pw.items()}
            if race.rules.get("runoff") and race.id in idx:
                # Georgia: majority needed. Minor candidates took ~1-2% recently; a runoff
                # happens when the two-party margin is within that share.
                col = margins[:, idx[race.id]]
                race_out[race.id]["p_runoff"] = float((np.abs(col) < 2.0).mean())

        def party_counts(office):
            ids = [r["race"].id for r in rows if r["race"].office == office]
            cnt = {k: np.zeros(n, dtype=np.int16) for k in ("D", "R", "I", "O")}
            for rid in ids:
                dwin, dp, rp = winners[rid]
                cnt[dp if dp in cnt else "O"] += dwin
                if rp:
                    cnt[rp if rp in cnt else "O"] += ~dwin
            return cnt, ids

        out = {"races": race_out}
        # Senate
        c, ids = party_counts("senate")
        d_tot = c["D"] + SENATE_NOT_UP["D"] + SENATE_NOT_UP["I_caucus_D"]
        r_tot = c["R"] + SENATE_NOT_UP["R"]
        d_ctrl = d_tot >= SENATE_MAJORITY
        r_ctrl = (~d_ctrl) & (r_tot >= SENATE_MAJORITY - (1 if VICE_PRESIDENT_PARTY == "R" else 0))
        out["senate"] = {
            "p_control": {"D": float(d_ctrl.mean()), "R": float(r_ctrl.mean()), "contingent": float((~d_ctrl & ~r_ctrl).mean())},
            "seats_hist": _hist(d_tot, 30, 70), "median_seats": {"D": float(np.median(d_tot)), "R": float(np.median(r_tot))},
            "mean_seats": {"D": float(d_tot.mean()), "R": float(r_tot.mean())},
            "p80": [int(np.percentile(d_tot, 10)), int(np.percentile(d_tot, 90))],
            "tipping": _tipping(rows, winners, margins, idx, ids, SENATE_MAJORITY - SENATE_NOT_UP["D"] - SENATE_NOT_UP["I_caucus_D"]),
            "not_up": SENATE_NOT_UP,
        }
        c, ids = party_counts("house")
        d_ctrl = c["D"] >= HOUSE_MAJORITY
        r_ctrl = c["R"] >= HOUSE_MAJORITY
        out["house"] = {
            "p_control": {"D": float(d_ctrl.mean()), "R": float(r_ctrl.mean()), "contingent": float((~d_ctrl & ~r_ctrl).mean())},
            "seats_hist": _hist(c["D"], 150, 290), "median_seats": {"D": float(np.median(c["D"])), "R": float(np.median(c["R"]))},
            "mean_seats": {"D": float(c["D"].mean()), "R": float(c["R"].mean())},
            "p80": [int(np.percentile(c["D"], 10)), int(np.percentile(c["D"], 90))],
            "tipping": _tipping(rows, winners, margins, idx, ids, HOUSE_MAJORITY),
        }
        c, ids = party_counts("governor")
        out["governor"] = {"mean_won": {k: float(v.mean()) for k, v in c.items()},
                           "seats_hist": _hist(c["D"], 0, 36)}
        return out


def _hist(arr, lo, hi):
    vals, counts = np.unique(arr, return_counts=True)
    total = counts.sum()
    return [{"seats": int(v), "p": round(float(c) / total, 5)} for v, c in zip(vals, counts)]


def _tipping(rows, winners, margins, idx, ids, needed_d):
    """Race that supplies the decisive seat, ordering races by D margin each sim."""
    cols = [idx[i] for i in ids if i in idx]
    if not cols:
        return []
    race_ids = [i for i in ids if i in idx]
    fixed_d = sum(1 for i in ids if i not in idx and winners[i][1] == "D")
    need = needed_d - fixed_d
    if need <= 0 or need > len(cols):
        return []
    sub = margins[:, cols]
    # I-side (non-caucusing) races can't supply a D seat; push them to the bottom.
    dmask = np.array([winners[i][1] == "D" for i in race_ids])
    sub = np.where(dmask[None, :], sub, -1e6)
    order = np.argsort(-sub, axis=1)
    tip = order[:, need - 1]
    cnt = Counter(tip.tolist())
    tot = sum(cnt.values())
    return [{"id": race_ids[k], "p": round(v / tot, 4)} for k, v in cnt.most_common(10)]
