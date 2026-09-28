"""Correlated Monte Carlo simulation.

Every race's final margin = its expected margin + a sum of shared shocks
+ an idiosyncratic shock. Shared shocks make outcomes move together:

  national     one draw per simulation, all races (governors at 0.75x)
  poll miss    one draw per simulation, scaled by how poll-driven a race is
               (an industry-wide miss like 2016/2020 hits every polled race)
  region       Northeast / Midwest / South / West
  state        every race in the same state (Senate, governor and House seats)
  demographic  education, Hispanic and Black population shares (state z-scores)

National and poll-miss draws are Student-t (df=5) so big misses happen more
often than a normal curve would say. Each race's total variance is matched to
its forecast SD: the idiosyncratic part is whatever is left over.
"""
from __future__ import annotations

import numpy as np

REGIONS = ["northeast", "midwest", "south", "west"]
FACTORS = ["college", "hispanic", "black"]


def _t(rng, df, size):
    x = rng.standard_t(df, size=size)
    return x / np.sqrt(df / (df - 2))


def simulate(races: list[dict], n_sims: int, national_sd: float, *, poll_miss_sd: float = 2.0,
             region_sd: float = 1.5, state_sd: float = 1.5, factor_sd: float = 1.2, seed: int = 2026,
             national_shift: float = 0.0) -> np.ndarray:
    """races: dicts with keys mean, sd, state, region, poll_weight, elasticity,
    z (dict factor->z-score). Returns margins array (n_sims, n_races)."""
    rng = np.random.default_rng(seed)
    n = len(races)
    states = sorted({r["state"] for r in races})
    s_idx = {s: i for i, s in enumerate(states)}
    nat = _t(rng, 5, n_sims) * national_sd
    miss = _t(rng, 5, n_sims) * poll_miss_sd
    reg = rng.standard_normal((n_sims, len(REGIONS))) * region_sd
    st = rng.standard_normal((n_sims, len(states))) * state_sd
    fac = rng.standard_normal((n_sims, len(FACTORS))) * factor_sd
    out = np.empty((n_sims, n), dtype=np.float32)
    for j, r in enumerate(races):
        el = r.get("elasticity", 1.0)
        z = np.array([r.get("z", {}).get(f, 0.0) for f in FACTORS])
        load_f = np.clip(z, -2.5, 2.5) / 2.0
        shared = (el * (nat + national_shift) + r.get("poll_weight", 0.0) * miss + reg[:, REGIONS.index(r["region"])]
                  + st[:, s_idx[r["state"]]] + fac @ load_f)
        shared_var = (el ** 2 * national_sd ** 2 + (r.get("poll_weight", 0.0) * poll_miss_sd) ** 2
                      + region_sd ** 2 + state_sd ** 2 + float(np.sum((load_f * factor_sd) ** 2)))
        idio_sd = np.sqrt(max(r["sd"] ** 2 - shared_var, 1.5 ** 2))
        out[:, j] = r["mean"] + shared + rng.standard_normal(n_sims) * idio_sd
    return out
