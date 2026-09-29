"""CLI: python -m bellwether.run [--sims N] [--asof YYYY-MM-DD]"""
from __future__ import annotations

import argparse
import time
from datetime import date

from .adapters.demographics import state_demographics
from .adapters.votehub import VoteHubPolls
from .adapters.wikipedia import WikipediaRaces
from .forecast import Forecast, Inputs
from . import overrides


def load_inputs(today: date) -> Inputs:
    vh = VoteHubPolls()
    return Inputs(races=overrides.apply(WikipediaRaces().races()), polls=list(vh.polls()), approval_polls=list(vh.approval()),
                  demographics=state_demographics(), today=today)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sims", type=int, default=40000)
    ap.add_argument("--asof", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--history", action="store_true", help="also rebuild probability-over-time")
    ap.add_argument("--no-bios", action="store_true", help="skip Wikipedia bio fetches")
    a = ap.parse_args()
    today = date.fromisoformat(a.asof) if a.asof else date.today()
    t0 = time.time()
    inp = load_inputs(today)
    fc = Forecast(inp, n_sims=a.sims)
    fc.build_polling()
    from .adapters.fec import FECFundraising
    fc.load_fundraising(FECFundraising())
    print(f"fundraising: {len(fc.fundraising)} races" if fc.fundraising else "fundraising: off (no FEC_API_KEY)")
    fc.bios = {}
    if not a.no_bios:
        from .adapters.bios import fetch_bios
        rows, _ = fc.race_inputs()
        titles = []
        for row in rows:
            r, pr = row["race"], row["pr"]
            m = row["est"]["fundamentals"][0] if row.get("est") else None
            if r.office == "house" and (m is None or abs(m) > 20):
                continue
            titles += [c.wiki for c in r.candidates if c.wiki and c.name in (pr.d_name, pr.r_name)]
        fc.bios = fetch_bios(list(dict.fromkeys(titles)))
        print(f"bios: {len(fc.bios)} of {len(set(titles))}")
    from .publish import publish
    publish(fc, out_dir=a.out, history=a.history)
    print(f"done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
