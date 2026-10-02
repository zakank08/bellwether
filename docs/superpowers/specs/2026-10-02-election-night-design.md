# Election night: automatic live results and calls (sub-project A)

Date: 2026-10-02. Election: 2026-11-03 (32 days). Status: draft for review.

This is sub-project **A** of a three-part iteration. **B** (forecast trust) and **C** (polish and growth) get their own specs.
Order agreed with the owner: A first, B alongside (different code), C last, feature freeze **Oct. 25**, rehearsal-only Oct. 26-30.

## 1. Goal

Make Bellwether behave like an AP or Decision Desk HQ results site, **fully automatic and on free sources**: live results for every
race where an official source can be read, automatic race calls, live chamber control, and honest labelling everywhere else.
No one is assumed to be on duty on the night.

### What was decided with the owner
- Free sources only (no AP/DDHQ). As complete as free sources allow.
- No hand entry of results. The override file stays only as an emergency kill switch to pause a bad feed.
- Races with no automatic source show "Results at [state's site]" with a link and a last-checked time.
- Calls are Bellwether's own ("Bellwether call"), never attributed to anyone else.

### Rules that still apply (from CLAUDE.md)
Never invent polls, results, candidates, dates or closing times. Missing data is shown as missing. Nonpartisan wording and colours,
odds written "X in 100". Polite fetching: per-host throttle, descriptive User-Agent. Redrawn-map states (AL, CA, FL, LA, MO, NC, OH, TN, TX, UT)
are never matched to pre-2026 district data.

### Boundaries I will not cross
- Official state and county election sites and their vendor platforms only. No scraping of AP, NYT, CNN, Fox or other licensed aggregators.
- No evasion of bot protection. A blocked state becomes a link-out state.

## 2. Architecture and data flow

1. **Source map** (`data/config/live_sources.json`): assigns each state or county a reader. An election-week probe records which sources answer.
2. **Worker** (`pipeline/bellwether/results/worker.py`, extended): runs every ~45 s, calls every reader, rejects impossible numbers (votes falling,
   empty feed, negatives, more units than exist), keeps last good numbers, writes `results.json` and `status.json`.
3. **Call engine** (new, Python, runs in the worker): produces calls with reasons from counts, expected vote and the forecast. See section 4.
4. **Chamber control**: live odds and seat counts from calls and counts, conditioned on the forecast simulations (needs governor draws exported).
5. **Publish**: files go to Cloudflare R2; the static site polls one small file every 15 s.
6. **Safety**: stale or blocked feeds are labelled, never dropped silently. One kill-switch flag turns the live view off and the site reverts to the forecast.

## 3. Readers and coverage

Layers, in priority order:
1. **Platform adapters**, tested on real files. Done: Alaska, North Carolina, Minnesota, Georgia (Enhanced Voting), Clarity (tested on Colorado).
   To add: Clarity for SC, KY, AR, NJ and county sites; Enhanced Voting for UT, WA, ID; ElectionStats for MA, VT, CT, NM; common county platforms (Hart, ElectionWare).
2. **County aggregation** for states without a statewide feed (WI, MI, NH, PA and similar): read the largest counties and combine. Race pages say "based on N of M counties".
3. **Key-state bespoke readers** for Senate, governor or swing House states that fit no platform, ordered by closeness in the forecast.
4. **Link-out fallback** for everything else.

Timeline: many states publish live addresses only in election week.
- Oct. 2-25: build and test every adapter on 2022 and 2024 files; config maps each state to an adapter.
- Oct. 25-Nov. 2: plug in 2026 addresses as they appear; the existing daily probe confirms each source answers; `/status` shows a readiness table.
- Risk: state sites may block GitHub's servers. The probe shows this early; the worker can move to another free runner (Cloudflare Workers or a small always-on box) with no design change.
- Coverage is reported per race on `/status`.

## 4. Call engine

**Expected vote.** Build per-county turnout estimates from certified 2022 and 2024 results. Progress is counted vs expected vote per county; where a state
has no county detail, fall back to units reporting with stricter call rules. This replaces the current placeholder estimate.

**Projected margin.** Compare each reporting county with its 2024 baseline to get the swing so far; apply it to counties still out, weighted by expected
remaining vote. Output a projected final margin and a spread, wider early and in mail-heavy states.

**A race is called only when all hold:**
1. The state's last polls have closed (multi-timezone states wait for the last closing).
2. Probability the leader wins is at least 99.5% under the projection (final cutoff chosen from rehearsal results; may be stricter).
3. The lead is outside the recount band (about one point) and larger than the remaining vote could plausibly move.
4. Runoff, ranked-choice and all-party-primary races are not called unless someone is above 50%.
5. Mail-heavy states (AZ, CA, CO, NV, OR, UT, WA) clear the stricter bar already in `web/lib/live.ts` (80% of units, half the expected vote).

Calls are labelled "Bellwether call"; the alternative state is "too close to call". Each call stores a plain-language reason and its inputs. A call can be
withdrawn, and a withdrawal is shown visibly with its reason.

**Chamber control** is called only when called seats guarantee a majority; before that, show live odds.

**Honest limit.** Only final 2022/2024 results exist, not timed snapshots. The engine is validated on simulated nights and replays of final files, not real timing,
so thresholds stay strict and the exact cutoff is decided with the owner after rehearsals.

## 5. Pages (what visitors see)

- **Automatic switch:** home shows the forecast until the first polls close, then a live view appears above it, driven by a flag in the results file (no redeploy).
- **Live home:** chamber seat bar (called, leading, not yet in), live control odds, a banner when control is called; calls feed (calls, chamber crossings, polls closing next);
  races to watch (all Senate and governor races, closest House seats, grouped by closing time); flips so far; find my races (ZIP).
- **Race pages:** call badge with reason, expected-vote progress bar, source and "updated N seconds ago", live county map for every state whose reader gives county detail.
- **State pages:** every race in the state with call status.
- **Honesty:** site-wide banner when feeds are delayed or blocked; link-out text for races with no source; ranked-choice (ME, AK) shows first-round counts with a note;
  runoff races (GA Dec. 1, LA Dec. 12) keep a "runoff" state after election night.
- **Performance and access:** pages stay static; one results file polled (target under 200 KB gzipped, cached 15 s); mobile-first; reduced motion respected;
  symmetric wording and colours; embeds and the Atom feed gain live race and chamber cards.

## 6. Testing, rehearsal, launch

- **Unit tests:** each adapter against real 2022/2024 files; county aggregation with partial county sets; call engine on simulated nights at early leans from 0 to 20 points with
  **zero wrong calls required** at the chosen threshold, plus replays of real final files.
- **Failure drills:** feed down, junk data, votes going backward, blocked host, R2 unreachable, stale file. Each shows the right label and never a wrong number.
- **Rehearsals** run through the real worker, R2 bucket and site: first full dress Oct. 26, final with drills Oct. 29-30. Nothing new ships after Oct. 25 except reader fixes.
- **Load test:** tens of thousands of simulated visitors polling the file; feeds the Oct. 20 hosting decision (Vercel Pro vs Cloudflare Pages).
- **Unattended running:** worker auto-starts from a schedule at 5 p.m. ET Nov. 3 (manual button as backup); three chained jobs cover about 16 hours; the watchdog alerts the owner
  (GitHub issue email) if the results file is older than 3 minutes on election night.
- **Go/no-go (Nov. 1):** every Senate and governor state has a reader or a link-out; R2 and secrets set; hosting decided; kill switch tested; call threshold final; last rehearsal had zero wrong calls.

## 7. Success criteria

- Every race shows live numbers with a source and freshness time, or a clear link-out.
- Zero wrong calls in rehearsals.
- Automatic states update within about two minutes.
- The site stays up under the load test.

## 8. Out of scope

Paid feeds, hand entry of results, anyone else's calls, and the forecast-trust (B) and polish (C) work.

## 9. Open items needing the owner

- Cloudflare account and R2 setup (steps in `docs/live-storage-setup.md`) and the four GitHub secrets.
- Hosting decision by Oct. 20 (Vercel Pro vs Cloudflare Pages) after the load test.
- Final call-probability cutoff after rehearsals.
- Whether to add a paid feed later (the `ResultsSource` interface leaves room for it).
