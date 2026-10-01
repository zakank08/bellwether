# Bellwether — notes for Claude Code

Nonpartisan 2026 midterm forecast site: polling averages, a correlated Monte Carlo
model, race pages, a what-if builder. Live at https://bellwether-zak.vercel.app.
Owner: Revaz (non-developer; explain choices in plain language, keep him informed).

**Read `docs/HANDOFF.md` first** for current status and the prioritized plan.

## Layout
- `pipeline/` Python 3.11. `python -m bellwether.run` fetches data, runs the model,
  writes JSON to `web/public/data/`. Key modules:
  - `adapters/` one file per source (VoteHub polls, Wikipedia races, FEC, bios, markets, demographics)
  - `http.py` polite fetcher: per-host throttle, disk cache in `data/cache/` with `.meta`
    sidecars holding real fetch times, stale fallback when a source is down
  - `averaging.py` poll averages (house effects, LV adjustment, adaptive recency)
  - `fundamentals.py`, `candidate_history.py`, `house_history.py` non-poll inputs
  - `simulate.py` correlated simulation; `forecast.py` orchestration; `publish.py` all outputs
  - `backtest.py` 2018–2022 calibration → `web/public/data/backtest.json`
- `web/` Next.js 16 static export (`output: "export"`). Pages in `app/(site)/`,
  embeds in `app/embed/`. Server components read JSON via `lib/data.ts` at build time.
- `data/config/` hand-edited inputs (overrides, poll-closing fallback, upcoming elections).
- `.github/workflows/forecast.yml` runs the pipeline 3×/day and commits results;
  Vercel redeploys on every push to `main`.

## Commands
```bash
cd pipeline && python -m pytest -q                       # must pass (53 tests)
cd pipeline && python -m bellwether.run --sims 40000      # add --history to rebuild the odds backcast (~5 min)
cd pipeline && python -m bellwether.backtest              # after any model change
cd web && npm install && npx next build                   # ~1,000 static pages; must build clean
cd web && npx tsc --noEmit
```
Validate workflow edits with actionlint (`secrets.*` is not allowed in step `if:`; that
bug silently disabled every scheduled run until Sept. 29).

## Rules
- Never invent polls, results, candidates, dates or closing times. Missing data is shown as missing. Every data file cites its source.
- Nonpartisan presentation: symmetric wording and colors, no adjectives about candidates. Odds are written "X in 100".
- Wikipedia: keep the 6-second throttle for the parse API and a descriptive User-Agent (`BELLWETHER_USER_AGENT`). It rate-limits hard.
- The 10 states that redrew House maps for 2026 (AL, CA, FL, LA, MO, NC, OH, TN, TX, UT) must never be matched to pre-2026 district data.
- Design tokens live in `web/app/globals.css` (light + deliberate dark theme). Honor `prefers-reduced-motion`. Charts draw at real container width.
- After a model change: run tests, backtest, `run --history`, then build. Update the methodology page (`web/app/(site)/methodology/page.tsx`) to match.
- Commit messages end with the Co-Authored-By line; push to `main` deploys to production, so build locally first.
