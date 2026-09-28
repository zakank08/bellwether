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
    a = ap.parse_args()
    today = date.fromisoformat(a.asof) if a.asof else date.today()
    t0 = time.time()
    inp = load_inputs(today)
    fc = Forecast(inp, n_sims=a.sims)
    fc.build_polling()
    from .publish import publish
    publish(fc, out_dir=a.out, history=a.history)
    print(f"done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
