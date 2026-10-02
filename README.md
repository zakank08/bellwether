# Bellwether — 2026 midterm forecast

A nonpartisan election tracker: polling averages, a correlated Monte Carlo forecast for every Senate, House and governor race, and a static news-style site.

```
pipeline/   Python: ingestion adapters, polling averages, model, backtest, JSON publisher
web/        Next.js (static export): forecast pages, race pages, trackers, methodology
data/       config/overrides.json (hand corrections), history/ (538 raw polls), cache/ (raw fetches)
```

## Quick start

```bash
# 1. Model
cd pipeline
pip install -r requirements.txt
curl -sSfL https://raw.githubusercontent.com/fivethirtyeight/data/master/pollster-ratings/raw_polls.csv -o ../data/history/raw_polls.csv
python -m pytest -q                     # unit tests (averaging + simulation)
python -m bellwether.run --history      # fetch, forecast, write web/public/data/*.json
python -m bellwether.backtest           # 2018–2022 calibration -> web/public/data/backtest.json

# 2. Site
cd ../web
npm install
npm run dev        # http://localhost:3000
npm run build      # static site in web/out/
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `BELLWETHER_USER_AGENT` | recommended | Identifies the crawler to Wikipedia/VoteHub (include a contact email). |
| `CENSUS_API_KEY` | optional | Census ACS for demographics; without it, Wikipedia tables of Census data are used. |
| `FEC_API_KEY` | optional | Fundraising term (adapter pending; no effect until added). |
| `BELLWETHER_CACHE` | optional | Where raw fetches are cached (default `data/cache`). |

## Data refresh

`python -m bellwether.run` fetches every source through `bellwether/http.py`, which throttles per host, retries, caches every response on disk and falls back to the last good copy if a source is down — one dead feed never blocks a run. `.github/workflows/forecast.yml` runs it three times a day, commits the JSON snapshot and pings a Vercel deploy hook.

Sources (all verified live Sept. 28, 2026): VoteHub Polling API (polls), Wikipedia 2026 election pages (races, candidates, Cook PVI on 2026 lines, published ratings; CC BY-SA), FiveThirtyEight raw polls (pollster ratings, backtest; CC BY 4.0), Polymarket Gamma and Kalshi public APIs (comparison only).

Paid/unavailable, behind interfaces in `pipeline/bellwether/adapters/base.py`: AP Elections API or Decision Desk HQ for live results (`ResultsSource`).

## Deployment

`web/` is a pure static export (`output: "export"`), deployable to Vercel (root directory `web`, build `npm run build`, output `out`) or any CDN. No server or database is needed: election-night results are written by a GitHub Actions worker to object storage (R2) and read by the static pages.

## Hand corrections

Edit `data/config/overrides.json`. Every entry needs a `reason`, which is shown on the race page.
