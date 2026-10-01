# Election-night rehearsal: what it showed (Oct. 1, 2026)

Demo: `/election-night-demo/` (not linked from the site, hidden from search engines, banner on every screen:
"REHEARSAL DEMO. SIMULATED RESULTS, NOT REAL."). It replays one outcome from the forecast's own correlated
simulations from 6 PM to 3 AM ET, with the real poll-closing times, an S-shaped count in each race, early counts
that lean differently from the final result, state feeds that update every 2–6 minutes, and four failure drills.
The logic lives in `web/lib/live.ts` (live odds, the "Decided" rule, special rules, chamber odds) and
`web/lib/demo.ts` (the pretend night). Tests: `cd web && npm run test:live` (26 tests).

## What worked
- **The layout reads at a glance** on a laptop and a phone: chamber control odds, a seat bar split into decided /
  leading / not in yet, flips so far (yellow), races to watch, polls-closing timeline, feed health.
- **"Decided" never made a wrong call** across 3 pretend nights, every 3 minutes, all 470 races, with and without
  failures (about 98,000 race-moments). Special rules held: no call under a third counted, none within one point,
  no call below 50% in runoff / ranked-choice / all-party-primary races.
- **Failure drills show sensible messages**: a feed down shows "Feed stale · N min" and the numbers freeze; hand-entered
  numbers show "Entered by hand from …" with the reason; unreadable data keeps the last good numbers; a count that goes
  backward is kept at the higher number and flagged.
- **Live chamber odds** (the what-if engine, conditioned on Decided races and weighted by counts so far) scored better than
  using Decided races alone in a 24-night replay. Caveat: that replay only used our own pretend nights.

## Fix / add / change before Nov. 3 (most important first)
1. **Governors are missing from the simulation file**, so the live chamber odds and the rehearsal skip all 36 governor
   races. Export governor draws the way Senate and House are exported.
2. **Expected vote is a placeholder** (about 350,000 per House district). "% of expected vote counted" and the Decided rule
   both depend on it. Build real estimates from 2022 and 2024 turnout (by county where we can).
3. **The Decided rule is a first guess.** It held up when early counts leaned up to 12 points off the final result and
   began to slip at 16 (26 wrong calls in about 98,000, all in one Michigan Senate race). Real mail-heavy states
   (CA, WA, OR, AZ, NV, UT, CO) can skew that much early. Proposal: for those states require 80% of units reporting and
   half the expected vote before any call. Decide how cautious you want to be.
4. **Live odds and the rule need rehearsal on real 2024 results**, not just pretend nights. This happens once the
   readers and 2024 fixtures exist (Phase 1b/1e).
5. **Race pages have no live block yet.** Today the rehearsal is one page; each race page needs the same live panel
   (counted margin, % counted, last updated, status, per-county table where available).
6. **The real home page needs an election-night mode**: before polls close show the forecast as now; once polls close,
   put the live view on top. Decide whether it replaces the home page or sits above it.
7. **A site-wide banner when feeds are stale or broken** (the demo shows per-race chips and a feed-health list, but a
   visitor on a race page needs the warning there too).
8. **Key-race curation**: "Races to watch" is closest-first by live odds; on the night we likely want a hand-picked list
   (Senate and governors first, then the most contested House seats) plus search by state.
9. **Page weight for a busy night**: the demo loads about 0.8 MB of simulation data; the real live file must be small and
   cached for 15 seconds or less. Measure before the Oct. 20 hosting decision.
10. **Ranked-choice follow-up** (Maine, Alaska): a page that explains the later tabulation and shows it when available.
11. **Mobile navigation** is cut off at "Governors" on narrow phones (existing issue, noticed during this review).
12. **The correction screen is not in the demo**; it shows only what an override looks like to a visitor. The guide for
    editing `data/config/live_overrides.json` is still to write.

## Decisions for Revaz
- How cautious should "Decided" be (item 3)? More caution means calls come later but are safer.
- Live view on the home page, or a separate page linked from it (item 6)?
- Hand-picked key races or automatic closest-first (item 8)?
