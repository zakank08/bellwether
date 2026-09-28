"""Prediction-market odds (Polymarket Gamma API and Kalshi public market
data; both free, no key). Shown next to the model, clearly labeled: markets
are bets, not polls, and they are not an input to the forecast."""
from __future__ import annotations

import json
from urllib.parse import quote

from ..http import fetch_json
from .base import MarketSource

POLY_SEARCH = "https://gamma-api.polymarket.com/public-search?q={q}&limit_per_type=5"
KALSHI_EVENTS = "https://api.elections.kalshi.com/trade-api/v2/events?series_ticker={s}&with_nested_markets=true&status=open"

CHAMBER_QUERIES = {"senate": "Which party will win the Senate in 2026", "house": "Which party will win the House in 2026"}
KALSHI_SERIES = {"senate": "CONTROLS", "house": "CONTROLH"}


def _party_of(label: str) -> str | None:
    l = label.lower()
    if "democrat" in l:
        return "D"
    if "republican" in l:
        return "R"
    return None


class PolymarketChambers(MarketSource):
    name = "Polymarket"

    def markets(self):
        out = []
        for chamber, q in CHAMBER_QUERIES.items():
            try:
                res = fetch_json(POLY_SEARCH.format(q=quote(q)), max_age_s=1800)
            except Exception:
                continue
            ev = next((e for e in res.get("events", []) if "2026" in e.get("title", "") and chamber in e.get("title", "").lower()), None)
            if not ev:
                continue
            probs = {}
            for m in ev.get("markets", []):
                p = _party_of(m.get("groupItemTitle") or m.get("question", ""))
                try:
                    yes = float(json.loads(m.get("outcomePrices", "[]"))[0])
                except (ValueError, IndexError, TypeError):
                    continue
                if p and m.get("active", True) and not m.get("closed", False):
                    probs[p] = yes
            if probs:
                tot = sum(probs.values())
                out.append({"source": self.name, "chamber": chamber, "title": ev.get("title"),
                            "url": f"https://polymarket.com/event/{ev.get('slug')}",
                            "p": {k: round(v / tot, 3) for k, v in probs.items()},
                            "volume": ev.get("volume")})
        return out


class KalshiChambers(MarketSource):
    name = "Kalshi"

    def markets(self):
        out = []
        for chamber, series in KALSHI_SERIES.items():
            try:
                res = fetch_json(KALSHI_EVENTS.format(s=series), max_age_s=1800)
            except Exception:
                continue
            for ev in res.get("events", []):
                if "2026" not in (ev.get("title", "") + ev.get("sub_title", "") + ev.get("event_ticker", "")) and "26" not in ev.get("event_ticker", ""):
                    continue
                probs = {}
                for m in ev.get("markets", []):
                    p = _party_of(m.get("yes_sub_title") or m.get("title", ""))
                    price = m.get("last_price_dollars") or m.get("yes_bid_dollars")
                    if price is None and m.get("last_price") is not None:
                        price = m["last_price"] / 100
                    try:
                        price = float(price)
                    except (TypeError, ValueError):
                        continue
                    if p:
                        probs[p] = price
                if probs:
                    tot = sum(probs.values())
                    out.append({"source": self.name, "chamber": chamber, "title": ev.get("title"),
                                "url": f"https://kalshi.com/markets/{series.lower()}",
                                "p": {k: round(v / tot, 3) for k, v in probs.items()}})
                    break
        return out
