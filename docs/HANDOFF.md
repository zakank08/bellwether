# Bellwether handoff — Sept. 29, 2026 (35 days to the election)

## 1. Where things stand

Live: https://bellwether-zak.vercel.app · Repo: `zakank08/bellwether` (branch `main`)

Built and working:
- **Forecast** for 35 Senate, 36 governor and 435 House races on 2026 lines. 40,000
  correlated simulations; three versions (polls only / + fundamentals / + expert ratings).
  Model 0.2.x: adaptive-recency poll averages, pollster ratings from 538's archive,
  incumbent track record (Senate/governor from 538 file; House from 2024 Wikipedia results),
  House fundamentals refit each run on 2024 district results, FEC fundraising term (capped
  ±2.5), backtest 158/172 correct on 2018–2022 Senate/governor races.
- **Pages:** home (seat arcs, races to watch, maps, House hex map, trends, markets, movers),
  Senate/House/Governor lists, 506 race pages (gauge, outcome distribution, polls, odds over
  time, bios, fundraising, next/previous), what-if builder (conditions on real simulation
  draws, share links, save image), generic ballot & approval trackers, pollster ratings,
  methodology, election-night schedule (all 50 poll-closing times + countdown), find-my-races
  by ZIP, follow races (localStorage), embeddable race cards, stale-data banner.
- **Automation:** `.github/workflows/forecast.yml` at 7:15, 1:15, 7:15 ET. It was invalid
  until commit `fa1bee7` (Sept. 29); **the 1:15 p.m. Sept. 29 run is the first real one.**

## 1b. National polls file (added Sept. 29)
VoteHub stopped carrying most Trump-approval and generic-ballot polls after June 2026
(0 approval polls in July, 7 in August, 0 in September). `data/config/national_polls.json`
now holds those polls, read from each pollster's own release and linked (64 entries,
July 3–Sept. 28: YouGov/Economist weekly, Reuters/Ipsos, Quinnipiac, Emerson, Marist,
CNN/SSRS, Echelon, Verasight, AP-NORC, ARG, Fox). `adapters/curated.py` merges them and
skips any poll VoteHub already has. **Keep it current weekly** until Nov. 3;
`pipeline/tools/yougov_economist.py` reads the YouGov PDFs. The polls page says how many
polls ended in the last 30 days and warns when there are fewer than 8.

## 1c. Automation and tools added Oct. 1
- **Forecast workflow** (`forecast.yml`) now has six slots a day at off-peak minutes (GitHub starts scheduled runs late
  and sometimes skips them). The 2:37am ET run also rebuilds the odds-over-time history. A failed run opens a GitHub issue.
- **`watchdog.yml`** (hourly): opens an issue if the published forecast is more than 14 hours old, closes it when fresh,
  and opens one when the Census publishes the official 2026 district shapes (not out yet as of Oct. 1; the 10 redrawn
  states can't be drawn from the old files).
- **`national-polls.yml`** (Tue/Fri): `pipeline/tools/update_national_polls.py` reads new YouGov/Economist, Reuters/Ipsos,
  Echelon and Quinnipiac polls from their own PDFs/tables, checks every number, and adds the ones that pass to
  `data/config/national_polls.json`. Anything it can't verify, and Emerson/Marist/CNN/Verasight/Fox/ARG/AP-NORC when
  they've gone 35 days with no entry, opens an issue "National polls need a look" — those are added by hand.
- **Approval average** is now corrected for each pollster's usual lean (and for adults vs registered vs likely voters),
  like the generic ballot. Net approval -25.1 -> -23.5; chamber odds moved under 1 point.
- **Race share images**: `/og/race/<id>.png`, drawn at build time from `web/app/og/race/[file]/route.tsx` (nothing committed).
- **`/status` page**: last refresh, national poll coverage, races with thin polling, source health.
- **Poll-closing times for the 15 non-Senate states confirmed** with each state's election office (Sept. 30); sources are
  in `data/config/poll_closing_fallback.json`. North Dakota counties pick their own closing time (7–9pm local).
- **Deploy gotcha**: if the same commit is pushed to `main` and to another branch at once, Vercel can build it only as a
  *Preview* and the live site doesn't change (seen Oct. 1). Push to `main` alone, confirm "Production" in the repo's
  Deployments list, then update any other branch.

## 2. Do first (today)

1. **Confirm the scheduled workflow works.** GitHub → Actions → `forecast`. Expect a
   "Forecast update …" commit on `main` and a fresh `updated` time in
   `https://bellwether-zak.vercel.app/data/forecast.json`. If it fails, read the log, fix,
   and trigger it with "Run workflow" (workflow_dispatch).
2. **Confirm FEC fundraising loaded.** The key exists only as the GitHub secret
   `FEC_API_KEY`. The run log prints `fundraising: N races`; race JSON (e.g.
   `/data/race/2026-sen-GA.json`) should have a non-null `money`. If `FEC_API_KEY` is missing
   or the adapter errors, fix `pipeline/bellwether/adapters/fec.py` (tests in
   `tests/test_fec.py`). Note the FEC limit: 1,000 calls/hour per key; the run makes ~150.
3. **Open PR #1** ("Fix poll midpoint calculation and improve UI messaging", branch
   `claude/cool-gauss-qnrp54`, made by another session at 12:32 a.m. on Sept. 29). It predates
   `fa1bee7` and `516d701`. Review it; keep valid fixes by rebasing onto `main`, re-run
   tests/backtest/build, then merge or close with a note. Don't merge blind.

## 3. Main project: election night (target: working by Oct. 25, rehearsed by Oct. 30)

Decision from Revaz: **free sources, all 50 states** (no AP/DDHQ). Consequences to design for:
no official race calls, uneven feed quality, some feeds break on the night.

### 3a. Research (write findings to `docs/results-sources.md`)
For each state (plus DC not needed), find the official election-night results site and
record: URL pattern, vendor/platform (many use Clarity/Scytl ENR under
`results.enr.clarityelections.com`; others are custom), machine-readable format (JSON/XML/CSV
vs HTML only), statewide vs county detail, whether 2024 general results are still online in
the same format (used for testing), refresh cadence, and robots/terms. Group states by
platform so one adapter covers many. Flag states with HTML-only or unreliable pages.

### 3b. Results adapters (`pipeline/bellwether/results/`)
- Implement the existing `ResultsSource` interface in `adapters/base.py`, one module per
  platform plus one-offs. Normalize to: race id (match our ids, e.g. `2026-sen-GA`,
  `2026-house-PA-07`), candidate → votes, precincts or reporting units reported/total,
  county breakdown when available, source URL, fetched_at.
- Test each adapter against that state's **2024** results pages (saved fixtures in
  `pipeline/tests/fixtures/results/`), so tests run offline.
- Candidate matching: reuse `averaging.match_candidate` logic; unmatched names must be
  logged, never silently dropped.

### 3c. Live pipeline and hosting
The site is a static export and redeploys take minutes, so live results must be served
separately and fetched by the browser.
- **Worker:** a loop polling every state every 30–60 s (respect each site; back off on
  errors), merging into one `live/results.json` (+ small per-race files if needed), plus
  `live/status.json` (per-state last success, error count). Options: a long-running GitHub
  Actions job (max 6 h per job; chain two jobs covering 6 p.m.–3 a.m. ET) or a small
  always-on host. Pick one, document why.
- **Storage the browser reads:** needs a CDN URL with short caching (≤15 s) that updates
  without a redeploy. Cloudflare R2 public bucket (free egress) or Vercel Blob. Revaz must
  create the account/token; give him exact click-by-click steps and have him store the token
  as a GitHub secret. Never ask him to paste secrets into chat.
- **Traffic:** Vercel Hobby includes 100 GB/month of transfer; a busy election night could
  exceed it and take the site down. Measure page weight (home is ~800 KB uncompressed), then
  either cut it, move the static site to Cloudflare Pages (free bandwidth), or tell Revaz the
  cost of Vercel Pro for November. Decide by Oct. 20.

### 3d. Live model and pages
- **Expected vote:** estimate each race's total vote from 2022/2024 turnout (by county where
  available) to show "% of expected vote counted". Label estimates as estimates.
- **Live odds:** start from the pre-election forecast; as votes come in, shrink uncertainty
  with the share counted and move the mean toward the counted margin adjusted for where the
  outstanding vote is. Keep it simple, test it on replays, and show the live gauge moving.
- **"Decided" label:** only when the outstanding vote (with a generous safety margin) can't
  overturn the lead. No "projected winner" language; no calls attributed to anyone else.
  Georgia: runoff if nobody tops 50%. Maine/Alaska RCV: show first-round counts and say the
  ranked-choice tabulation comes later. Louisiana House: Nov. 3 is an all-party primary.
- **UI:** live results on race pages and a results home state (chamber tallies: decided
  seats + current leaders, poll-closing timeline turning live, key races by closeness),
  "last updated" per race and per state, clear stale/broken-feed messages. Mobile first.
- **Correction screen:** Revaz enters/overrides numbers when a state feed breaks, or marks
  a race decided/undecided. Simplest safe design: `data/config/live_overrides.json` edited
  in the GitHub web editor, which the worker re-reads every loop (via the GitHub API, not the
  cached raw URL). Every override needs a reason and shows "Entered by hand from <source>".

### 3e. Rehearsal and load test (by Oct. 30)
- **Replay:** there are no free timestamped 2024 vote-drop feeds. Build a replay from 2024
  final results (state/county) released in realistic order by poll-closing time and
  reporting curves, pushed through the real worker → storage → site path at accelerated
  speed. Run a full-length rehearsal with Revaz watching.
- **Failure drills:** kill a state feed, send malformed data, send a vote count that goes
  down, and check the site's messages and the correction screen.
- **Load test:** hit the site and live JSON at election-night scale (e.g. k6/Artillery against a
  preview deploy), confirm CDN caching headers, and confirm nothing reaches an origin server
  per visitor.

## 4. Smaller items (fit in around the above)
- **Confirm the 15 fallback poll-closing times** in `data/config/poll_closing_fallback.json`
  (270toWin 2024 list) against each state's election office; replace the source note.
- **Race pages:** a per-race share image (the home page has `og.png`, generated in `og.py`).
- **House map:** real district outlines for 2026 once shapes exist for the redrawn states
  (Census TIGER lags; states publish their own). Keep the hex map as the default until then.
- **Custom domain:** Revaz may buy one; walk him through adding it in Vercel and set
  `NEXT_PUBLIC_SITE_URL` (used in metadata and embed links).
- **2024 backtest:** needs a 2024 Senate/governor poll archive with results (538's file
  stops at 2022). Only do this if a clean source exists.
- **After Nov. 3:** results archive, 2028 presidential map, state legislatures, ballot measures.

## 5. Known limitations (already disclosed on the site; keep it that way)
- Odds before Sept. 28, 2026 are a backcast using today's candidate list and lines.
- What-if uses 4,000 of the 40,000 simulations; odds there can differ by a point or two.
- House ZIP lookup can't match ZIPs to new districts in the 10 redrawn states; it lists all
  of that state's races instead.
- Races with one or two polls can still move a lot; the site flags 15+ point daily swings.
- `data/cache/` is committed so runs work offline and survive dead sources; it grows over time.

## 6. Timeline
| Date | Milestone |
|---|---|
| Sept. 29–Oct. 3 | Workflow + FEC confirmed, PR #1 resolved, results-source research done |
| Oct. 4–18 | Adapters for all 50 states with 2024 fixtures; worker + storage live on a test URL |
| Oct. 19–25 | Live model, live pages, correction screen; hosting/bandwidth decision made |
| Oct. 26–30 | Full replay rehearsal with Revaz, failure drills, load test |
| Oct. 31–Nov. 2 | Freeze: bug fixes only |
| Nov. 3 | Election night: worker running 6 p.m.–3 a.m. ET, Revaz on the correction screen |
