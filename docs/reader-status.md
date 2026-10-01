# Results readers: status by state (Oct. 1, 2026)

**Tested** = parses a real 2024 file saved in `pipeline/tests/fixtures/results/`.
**Same platform** = uses a tested reader but I have not opened that state's own 2024 data.
**Not built** = needs its own reader (or hand entry through `data/config/live_overrides.json`, see `docs/correction-guide.md`).
Each state also needs its 2026 election id/date in `data/config/live_sources.json` (the state publishes it on or just before Nov. 3).

| State | 2026 races | Status | Reader / note |
|---|---|---|---|
| AK | Sen, Gov, House | **Tested** | `alaska`: precinct CSV. First choices only; ranked-choice tabulation is separate |
| CO | Sen, Gov, House | **Tested** | `clarity` (summary.csv from Clarity, tested on 2024 CO) |
| GA | Sen, Gov, House | **Tested** | `enhanced_voting` (tested on 2024 House; Senate and governor use the same contest titles) |
| MN | Sen, Gov, House | **Tested** | `minnesota` (2024 Senate/House, 2022 governor) |
| NC | Sen, House | **Tested** | `north_carolina` (2024 House; also gives county detail for the Senate race) |
| SC, KY, AR, NJ | various | Same platform | `clarity`; SC's site is `enr-scvotes.org`. KY and AR returned errors to the probe |
| UT, WA, ID | House (UT, WA); Sen/Gov (ID) | Same platform, address unconfirmed | `enhanced_voting`; I could not find the 2024 election ids from outside the sites |
| MA, VT, CT, NM | various | Not built | ElectionStats sites (export format not yet mapped) |
| IL, MD, HI, DE, ME, LA, WY | various | Not built | Plain files/pages, but the 2026 live file names are not published until election week; verify then |
| FL, VA, IN, KS, IA, TN, MS, MT, NE, ND, SD, WV, OR, RI, CA, AL | various | Not built | State sites or apps; each needs its own reader |
| AZ, NV, NY, PA, TX, OH, OK, MO | various | Not built, bot protection | The state's site may refuse automated requests. Plan: check the GitHub probe results, then hand entry through the correction screen |
| WI, MI, NH | various | Not built, no statewide feed | Results sit on county or town sites. Plan: the 10-15 biggest counties plus hand entry |

## Coverage if nothing else is built
Five states, plus the Clarity and Enhanced Voting states once their election ids exist, give automatic numbers for roughly a fifth of the
statewide races. Everything else on the night is hand entry, or "no results yet" with the state's own site linked.

## Why not all 50 now
A reader needs the real file format, and for most states the live 2026 file does not exist yet and the 2024 file is the final certified
version in a different layout. Building readers I cannot test would produce confident-looking code that fails on election night.
So the order is: finish the states where I can test today (done above), then add a reader per state as each publishes its Nov. 3 page.
The worker, checks, correction screen and rehearsal already work for any reader added later.
