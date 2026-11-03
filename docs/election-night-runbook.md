# Election night runbook (Nov. 3-4, 2026)

All times Eastern (ET). UTC = ET + 5 hours on Nov. 3.

## What runs by itself
- **Forecast refresh:** about every 4-6 hours (GitHub "forecast" job). It keeps running tonight; it does not use vote counts.
- **Live results job ("election-night"):** starts itself at **10 a.m. CT / 11 a.m. ET (15:00 UTC)** and runs about 21 hours in four chained parts. It reads each state's official site every ~45 seconds and publishes:
  - **with Cloudflare storage set up:** every ~15 seconds;
  - **without it (the default today):** into the site itself, about every **12 minutes from 6 p.m. to 2 a.m. ET** and every 40 minutes outside that (each publish redeploys the site).
- **Site pages:** `/election-night/` (scoreboard, map, races), each race page's "Live results" box, a red "Election night" bar on every page, and a yellow banner that appears only if something is delayed.

## Things to check (2 minutes each)
1. **~11:30 a.m. ET:** GitHub -> Actions -> "election-night": one run "in progress". If there is none, click **Run workflow** (leave the boxes as they are).
2. **~4 p.m. ET:** open `/election-night/`: it should say "Results appear as polls close" and show no red banner.
3. **~6:30 p.m. ET:** Indiana and Kentucky should show numbers. Open a race page: "Live results" shows votes.
4. **Any time:** `https://github.com/zakank08/bellwether/blob/main/web/public/data/live/live.json`: the `"updated"` time near the top should be within the last ~15 minutes.

## If something looks wrong
| What you see | What it means | What to do |
|---|---|---|
| Yellow banner "Delayed: XX" | The state's site isn't answering; last numbers stay on screen | Nothing needed. If it lasts over 30 minutes, enter the numbers by hand (below) |
| Banner "Live results are delayed" | The worker hasn't published for a while | Check the Actions run is still green/in progress; if it stopped, Run workflow again |
| A race shows "By hand" | Someone entered it from `live_overrides.json` | Delete the entry when the state feed is back |
| A state shows nothing at all | Its feed isn't read automatically (see `docs/reader-status.md`) | Hand entry, or leave as "no results yet" with the state's site linked |

**Hand corrections:** follow `docs/correction-guide.md` (one page). The worker sees your edit within about a minute; the site shows it at the next publish.

## What is NOT automatic tonight
- Only states listed in `data/config/live_sources.json` with an election id are read automatically. Today: Minnesota and North Carolina (ready), Alaska and Georgia (waiting for the states to post), plus others as their ids are added.
- Every other state is "no results yet" unless entered by hand.
- "Decided" is our own conservative rule (never a call attributed to anyone else). Close races stay "counting" or "too close to decide" until the numbers are clear.

## Speed-up (optional, any time tonight)
Set up Cloudflare storage (`docs/live-storage-setup.md`, ~15 minutes). The next part of the job (or a manual re-run) then publishes every ~15 seconds.
