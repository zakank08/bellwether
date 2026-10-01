# Election-night results sources, all 50 states

*Research done Sept. 30 – Oct. 1, 2026. Free official sources only (no AP, no Decision Desk HQ).
Written for Revaz; the technical detail is in the table at the end.*

## The short version

1. **Roughly 30 states publish something we can read automatically** (files, a JSON feed, or plain tables).
   About 10 of those are very clean (one URL, one file format, precinct detail).
2. **About 10 states sit behind "bot protection"** (Cloudflare, Imperva, Akamai). Their sites turn away
   software that isn't a normal browser. A few of those states matter a lot: **Pennsylvania, Texas, Ohio,
   Arizona, Nevada, New York, Missouri, Oklahoma**. Some of this is because of where my tests ran (a cloud
   server); whether GitHub's servers get through is **unknown until the probe runs** (see "Biggest risk").
3. **Three states have no statewide election-night feed at all**: Wisconsin (72 county clerks post separately),
   Michigan (83 counties) and, to a lesser degree, New Hampshire (towns and counties). Reading them means
   reading dozens of county sites, or entering numbers by hand through the correction screen.
4. **Nobody posts anything resembling a "race call"**, as expected. A "Decided" label will come from our own
   rule, never from the states.
5. **2024 test data exists for most states** in the same format they will use on Nov. 3, which is what we need
   for rehearsal.

## Biggest risk: automated requests being turned away

I tested every state from this development machine with an honest, identifying User-Agent. Results
(`pipeline/tools/probe_results_sites.py`):

| What came back | States |
|---|---|
| Normal page or file | 36 of 50 |
| A bot-check page (Cloudflare / Imperva / Akamai) | AZ, MI (state portal), MO, NV, NY, PA, TX, WI, NH |
| Plain "403 Forbidden" | OH, OK, MA (500 error), parts of AR, KY, TN |
| Could not connect | WV, parts of AL, DE |

This machine is not the machine that will run the election-night worker, and bot protection often treats
different networks differently. So I added a daily check that runs **from GitHub's own servers**
(`.github/workflows/results-probe.yml`; it writes `docs/results-probe-latest.json`). After its first run I will
know which states work from GitHub and which need another approach. Options if a state blocks us:

- use that state's own downloadable files instead of its web page (often not protected);
- run the worker from a small hosted server with a different network address (a hosting decision for 1c);
- read less often and more politely;
- ask the state's election office whether it offers a data feed for developers (many do, free);
- as the last resort, you enter that state's numbers through the correction screen.

I will not try to get around a bot check by pretending to be a person's browser. That would break the
sites' own rules and could get us blocked everywhere.

## Groups, by software (so one reader covers several states)

| Group | What it is | States | Format | Notes |
|---|---|---|---|---|
| **A. Enhanced Voting "ENR"** (newer Clarity successor) | Web app at `…/results/public/<state>` with a JSON API | **GA, UT, WA** verified; **ID** likely | JSON (election info and counts); race-level numbers come from a second query endpoint that I will map when building | One reader covers 3–4 states. Georgia's 2024 general loads. |
| **B. Classic Clarity ENR** | `results.enr.clarityelections.com/<ST>/<id>/` with `current_ver.txt` and per-race JSON/XML | **CO, SC** verified; **KY, AR** believed (blocked from my test machine); **NJ** page references it | JSON/XML/ZIP per election version | Also used by hundreds of *county* sites, which matters for WI, MI, NY, PA. |
| **C. ElectionStats (Civera)** | Searchable archive with CSV/JSON export | **MA, VT, CT** (archives), **NM** (looks like it) | CSV/JSON | Strong for 2024 test data; live night feeds are separate for VT (`electionresults.vermont.gov`) and CT. |
| **D. Plain files the state posts** | A fixed file or folder of files, refreshed through the night | **NC** (ZIP of precinct CSVs on a public bucket), **MN** (semicolon-delimited text files), **AK** (CSV + ZIP), **HI** (`media.txt`/`summary.txt`), **IL** (CSV by office), **DE** (CSV), **LA** (static text pages), **MD** (HTML + CSV links), **ME** (HTML/Excel), **WY** (Excel ZIP) | CSV / TXT / XLSX | Easiest and most reliable. Each needs its own small reader, but the formats are stable. |
| **E. State-built web apps** | A custom site per state | **PA, OH, TX, AZ, NV, NY, OK, OR, MO, IN, FL, CT, VA, IA, RI** and others | HTML/JSON behind the page | Most bot-protected. Needs one reader each, and may need another route (see above). |
| **F. Plain state-hosted pages, vendor not identified** | Simple tables on the state's own site | **ND, SD, NE, MS, MT, KS, TN, WV** | HTML | Readable, but fragile (layout changes break the reader). |
| **G. No statewide feed** | State posts only after counties report | **WI, MI, NH** | County sites | 72 / 83 / ~10 county sites; see below. |

## States that matter most on Nov. 3 (2026 Senate race, governor race, or both)

Senate (35): AK AL AR CO DE FL GA IA ID IL KS KY LA MA ME MI MN MS MT NC NE NH NJ NM OH OK OR RI SC SD TN TX VA WV WY.
Governor (36): AK AL AR AZ CA CO CT FL GA HI IA ID IL KS MA MD ME MI MN NE NH NM NV NY OH OK OR PA RI SC SD TN TX VT WI WY.
Every state has House races (435 seats; 6 states have a single at-large seat: AK, DE, ND, SD, VT, WY).

**Easiest wins** (clean, open, high-interest): **GA, NC, MN, AK, UT, WA, CO, SC, LA, ME, MD**.
**Hard but important**: **PA, TX, OH, AZ, NV, MI, WI, NY** (bot protection and/or county-only reporting).

## Special rules we must handle (all confirmed in the state's own materials)

- **Georgia**: a runoff is held if nobody tops 50% (Dec. 1). Results page shows first-round counts.
- **Louisiana**: Nov. 3 House races are an all-party primary; runoffs Dec. 12 if needed. **Do not read the
  `/ElectionResults/ElectionResults/Data*` path**, which Louisiana's robots.txt disallows; the static
  text pages at `voterportal.sos.la.gov/static/` are the safe route.
- **Maine** and **Alaska** use ranked-choice voting: first-round counts on election night; the
  ranked-choice tabulation comes days later. Alaska publishes a CVR (ballot-level) export after the election.
- **North Dakota** polls close at different hours by county (7–9 p.m. local), so its numbers start later.
- **Arizona, Hawaii, Utah, Washington, California, Oregon, Colorado** count mostly mailed ballots; results
  stay incomplete for days. "% of expected vote counted" matters most here.
- **Pennsylvania** posts county-level only, and counties finish at very different times.
- **Wisconsin** counties report on their own schedule; municipalities have two hours, counties two more.

## Data we can use for rehearsal (2024 general election)

Verified to load from this machine (so these become offline test fixtures):

| State | 2024 data | URL pattern |
|---|---|---|
| **GA** | JSON election record, marked official | `results.sos.ga.gov/results/public/api/elections/Georgia/2024NovGen` |
| **NC** | ZIP of precinct results | `s3.amazonaws.com/dl.ncsbe.gov/ENRS/2024_11_05/results_pct_20241105.zip` |
| **MN** | text files (all races by precinct, 26 MB; per-office files) | `electionresultsfiles.sos.state.mn.us/20241105/allracesbyprecinct.txt`, `…/ushouse.txt` |
| **AK** | precinct CSV + ballot export | `elections.alaska.gov/results/24GENR/ENRbyPrecinct.csv` |
| **CO** | Clarity data folder responds (the 2024 general's id still to confirm) | `results.enr.clarityelections.com/CO/<id>/current_ver.txt` |
| **HI, DE, IL, MD, ME, WY, LA, VT, MA, CT** | listed on the state's results pages | see table below |

For the other states I'll build the fixtures when I write their reader, using the state's certified 2024
files where the live-night feed is no longer online.

## What I could not verify

- Anything on a site that blocked my test machine (marked **blocked** below). The platform and format shown
  for those states come from the state's own announcements and search results, not from reading the data, and
  are marked "unverified".
- How often each feed refreshes. Most states say "as results arrive"; the real cadence will come from
  watching 2024 replay data and, on Nov. 3, the live feed.
- Terms of use. I checked robots.txt only. For the 37 states whose robots.txt I could read (or that have none),
  none disallows ordinary page requests for our crawler name (Arkansas asks for a 5-second delay); for the other
  13 the file itself was blocked or unreachable. **I have not read each site's written terms of use.** Election
  results are public records, but I'll read the terms for each state we rely on before building its reader. We'll
  keep to one request per file per 30–60 seconds, cache aggressively, and stop on any "slow down" response.

## State-by-state table

Legend. **Verified**: I loaded the page or data. **Unverified**: from the state's own pages or search results; the site
blocked my test, or I haven't opened the data. **Sen/Gov** = has a 2026 Senate / governor race.
"Detail" = the finest level the official feed offers.

| State | Races | Official results site | Platform / format | Detail | 2024 test data | From my test |
|---|---|---|---|---|---|---|
| AL | Sen, Gov | alabamavotes.gov; sos.alabama.gov | State site; Excel/PDF (Excel for primaries, PDF certified) | County | Certified PDF | Page ok; main site cert error (unverified) |
| AK | Sen, Gov | elections.alaska.gov/election-results/ | Plain files: HTML + CSV + CVR ZIP. **RCV** | Precinct | `24GENR/ENRbyPrecinct.csv` ✔ | Open ✔ |
| AZ | Gov | results.arizona.vote; azsos.gov (Unofficial ENR) | State ENR app behind Cloudflare (unverified) | County | Unverified | **Bot-check** |
| AR | Sen, Gov | sos.arkansas.gov/elections/research/election-results | New ENR site + PDF/CSV precinct (unverified); Clarity formerly | Precinct (CSV) | 2024 report PDF | Page ok; Clarity 403 |
| CA | Gov | electionresults.sos.ca.gov; sos.ca.gov Statement of Vote | State ENR + CSV/XLSX (unverified) | County | Statement of Vote CSV/XLSX | Statement page ok; ENR unreachable |
| CO | Sen, Gov | results.enr.clarityelections.com/CO/ | **Classic Clarity** ✔ | Precinct | Clarity folder responds ✔ | Open ✔ |
| CT | Gov | ctemspublic.pcctg.net (state ENR); electionhistory.ct.gov (archive) | State app (Angular) + ElectionStats archive | Town | Archive | Open ✔ |
| DE | Sen | electionresults.delaware.gov; elections.delaware.gov/reports/GE2024.html | CSV + HTML | County / district | `GE2024.csv` listed | Report ok; live site unreachable |
| FL | Sen, Gov | results.elections.myflorida.com | State site (ASP) with downloads | County | Pages for 2024 | Open ✔ |
| GA | Sen, Gov | results.sos.ga.gov | **Enhanced Voting** ✔ JSON | County (precinct available) | `2024NovGen` ✔ | Open ✔ |
| HI | Gov | elections.hawaii.gov/election-results/ | Plain text (`media.txt`, `summary.txt`) | Island/county | Folder per election ✔ listed | Open ✔ |
| ID | Sen, Gov | voteidaho.gov | Looks like Enhanced Voting / Clarity (unverified) | County | Unverified | Open |
| IL | Sen, Gov | elections.il.gov Election Vote Totals | CSV by office | County | CSV by office listed | Open ✔ |
| IN | (House only) | enr.indianavoters.in.gov | State ENR app (Angular) | County | Unverified | Open; data format not mapped |
| IA | Sen, Gov | electionresults.iowa.gov; sos.iowa.gov | State site (unverified) | County | County canvass reports | Open |
| KS | Sen, Gov | sos.ks.gov election-night page (live 5 p.m. CT) | State site; HTML; precinct XLSX after | County | Precinct XLSX for past elections | Open; live format not mapped |
| KY | Sen | results.enr.clarityelections.com/KY; elect.ky.gov | Clarity believed | County | Unverified | Clarity **403**, state page ok |
| LA | Sen | voterportal.sos.la.gov (`/static/` text pages) | State site; static text; **all-party House primary Nov. 3** | Parish | Static pages | Open ✔ |
| ME | Sen, Gov | maine.gov/sos election-results-data | HTML/Excel. **RCV** | Town/county | Excel files listed | Open ✔ |
| MD | Gov | elections.maryland.gov/elections/2024/general_Results/ | Static HTML + CSV links | County | Page ✔ | Open ✔ |
| MA | Sen, Gov | electionstats.state.ma.us | **ElectionStats** (CSV/JSON export) | Town | Yes | Server error once (retry) |
| MI | Sen, Gov | 83 county sites; statewide on mvic.sos.state.mi.us | **No statewide election-night feed**; counties often use Clarity/other | County/precinct | MVIC history | State portal **bot-check** |
| MN | Sen, Gov | electionresults.sos.mn.gov + `electionresultsfiles.sos.state.mn.us/<date>/` | Plain semicolon text files ✔ | Precinct | `20241105/*.txt` ✔ | Open ✔ |
| MS | Sen | sos.ms.gov/elections-voting/election-results | State site; PDF/CSV recaps | County/precinct | 2024 recaps | Open |
| MO | (House only) | enr.sos.mo.gov | State ENR behind Cloudflare (unverified) | County | Unverified | **Bot-check** |
| MT | Sen | sosmt.gov/elections/results/ | State site; county ZIPs | County | Archive ZIPs | Open ✔ |
| NE | Sen, Gov | electionresults.nebraska.gov | State site; HTML | County | Unverified | Open |
| NV | Gov | silverstateelection.nv.gov | State ENR behind Imperva (unverified) | County | Unverified | **Bot-check** |
| NH | Sen, Gov | sos.nh.gov/2024-general-election-results | State posts county Excel; **town results mostly from towns** | Town (not centralised) | County Excel | **Bot-check** |
| NJ | Sen | nj.gov/state/elections/election-night-results | Clarity referenced on the page | County | Archive | Open ✔ |
| NM | Sen, Gov | electionresults.sos.nm.gov | ElectionStats-like site | County/precinct | Yes | Open ✔ |
| NY | Gov | nyenr.elections.ny.gov (unofficial ENR, counties upload); results.elections.ny.gov | State ENR behind Cloudflare | County | Unverified | **Bot-check** |
| NC | Sen | er.ncsbe.gov; `s3.amazonaws.com/dl.ncsbe.gov/ENRS/<date>/` | Plain files: ZIP of precinct CSVs ✔ | Precinct | `results_pct_20241105.zip` ✔ | Open ✔ |
| ND | (House only) | results.sos.nd.gov | State site; HTML | County | Unverified | Open |
| OH | Gov | liveresults.ohiosos.gov | State ENR behind Cloudflare (unverified) | County | Dashboards | **403** |
| OK | Sen, Gov | results.okelections.us | State ENR (unverified) | County | Unverified | **403** |
| OR | Sen, Gov | results.oregonvotes.gov | State ENR (unverified) | County | Unverified | Open ✔ (main page) |
| PA | Gov | electionreturns.pa.gov | State ENR; county-level; "My County" links | County | Unverified | **Bot-check** |
| RI | Sen, Gov | ri.gov/election/results/2024/general_election/; elections.ri.gov | State site; HTML + PDF | Municipality | Yes | Open ✔ |
| SC | Sen, Gov | enr-scvotes.org/SC/ | **Classic Clarity** ✔ | County | List ok ✔ | Open ✔ |
| SD | Sen, Gov | electionresults.sd.gov | State site; HTML | County | Unverified | Open |
| TN | Sen, Gov | tnmap.tn.gov/electionresults/ (live); sos.tn.gov/elections/results (precinct XLSX after) | ArcGIS-style map + XLSX | County/precinct | XLSX by election | Mixed |
| TX | Sen, Gov | results.texas-election.com | State ENR behind Cloudflare | County | Archive | **Bot-check** |
| UT | House only | electionresults.utah.gov | **Enhanced Voting** ✔ | County | Unverified | Open ✔ |
| VT | Gov | electionresults.vermont.gov (live); electionarchive.vermont.gov | State site + ElectionStats archive | Town | Archive | Open ✔ |
| VA | Sen | results.elections.virginia.gov; CSVs at `apps.elections.virginia.gov/SBE_CSV/` | State site + CSV downloads | Locality | CSV store | Open ✔ |
| WA | House only | results.votewa.gov/results/public/washington | **Enhanced Voting** ✔ | County | Page ✔ | Open ✔ |
| WV | Sen | results.wvsos.gov | State site | County | Unverified | Could not connect |
| WI | Gov | **72 county clerk sites** (linked from elections.wi.gov) | **No statewide feed** | County/municipality | WEC canvass | WEC site **bot-check** |
| WY | Sen, Gov | sos.wyo.gov/Elections | Excel ZIP + PDF after; live page | County/precinct | `Docs/2024/2024GeneralResults.aspx` | Open ✔ |

Five states have only House races in 2026 (IN, MO, ND, UT, WA). The 10 states that redrew House maps for 2026 (AL, CA, FL, LA, MO, NC, OH, TN, TX, UT)
must be read by **2026 district number only**; never matched to 2024 district data.

## What I'd build, in order

1. **Reader for plain files first**: NC, MN, AK, HI, IL, MD, LA, ME, DE (verified; 2024 fixtures ready).
2. **Enhanced Voting reader**: GA, UT, WA (+ ID), after mapping its race-results query.
3. **Classic Clarity reader**: CO, SC (+ KY, AR, NJ if reachable).
4. **ElectionStats reader**: MA, VT, CT, NM.
5. **State apps one by one**: FL, VA, IN, KS, IA, TN, then the bot-protected ones depending on what the
   GitHub probe shows (PA, TX, OH, AZ, NV, NY, OK, OR, MO).
6. **County-by-county states** (WI, MI, NH): start with the 10–15 most important counties, and use the
   correction screen for the rest.

## Decisions I need from you

- None yet. After the first GitHub probe results (daily from tomorrow), I'll come back with a concrete answer on
  *where the worker should run* (GitHub Actions vs a small hosted server) and on which states will need
  hand entry. If you want, you can start the probe now: **GitHub → Actions → "results-probe" → Run workflow**.
