# Election Night (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully automatic, free-source election-night results site: live results, automatic "Bellwether calls", live chamber control, with honest link-outs where no official feed can be read.

**Architecture:** The existing Python worker (`pipeline/bellwether/results/`) reads state/county feeds, validates them, and now also *computes calls* (one source of truth) and writes them into `results.json`. The static Next.js site only displays what the worker publishes (via Cloudflare R2, polled every 15 s). Everything that decides a call lives in one config file, `data/config/call_rules.json`, shared by Python and the web demo.

**Tech Stack:** Python 3.11 (pytest, requests, boto3), Next.js 16 / React 19 / TypeScript (node:test), GitHub Actions, Cloudflare R2.

**Spec:** `docs/superpowers/specs/2026-10-02-election-night-design.md`

## Spec corrections found while planning (read first)

1. **"Zero wrong calls at 0-20 point early leans" is not achievable with unit-count calls alone at a practical speed.** A throwaway simulation (4,000 races, every race's early count leaning toward the *eventual loser*, "share counted" mis-estimated by up to +/-25%) gave:
   - P(call) 0.995 / late-vote spread 10 / min 50% reporting: about **4% of close races called wrongly** at a 12-point lean.
   - P 0.9999 / spread 24 / min 80% reporting: **zero wrong through a 16-point lean, about 1 in 4,000 at 20**, but races are only called at about 90% reporting.
   So the plan's defaults are the strict ones. **Two consequences the owner should know:**
   - **County-level projection (Task 4) is what makes calls come earlier.** In a synthetic worst case (late urban counties moving up to 30 points against the early count) it made zero wrong calls with a spread of 12, called about 27% of races before the last county reported (unit-count mode: 10%) and about 19% of races decided by under 5 points (unit-count mode: essentially none). In mail-heavy states it is stricter: 8% early and no race under 5 points. Unit-count mode alone, used for House races and states without county detail, effectively never calls close races.
   - **A lead under about 8 points is not auto-called, even at 100% of precincts in unit-count mode.** The rule keeps a 10% "vote could still be outstanding" cushion because the share-reporting figure can be wrong by 25% (mail, provisional and late-posted ballots). That cushion (`cushion` in `call_rules.json`) is the single knob that trades wrong-call risk for how many close races get called. Those races show "Counting" or "Too close to call" with the real numbers and sources. AP-style calls on close races rely on human judgment and richer data; with nobody on duty we choose not to guess. The owner decides whether to loosen it after the Oct. 26 rehearsal.
   The acceptance criterion in the plan is: zero wrong calls through a 16-point early lean (units mode, non-mail states), zero through 20 for mail-heavy states, zero in all five county scenarios, and the measured rates recorded in `docs/call-validation.md`. The owner approves the final numbers (spec section 9).
2. **Calls live in one place.** The spec's call engine is in the worker; the browser no longer decides calls. `web/lib/live.ts#decide` remains only for the rehearsal demo page and is renamed in the UI to "Bellwether call" like everything else (Task 10).
3. **Expected vote uses 2024 county baselines plus a turnout ratio learned from the live count**, not a 2022 county file. A 2022 source is researched in Task 3 and used only if a real, citable file is found.
4. **Reader tasks that need a format nobody has seen are marked BLOCKED until a real sample file is committed** (Tasks 14-16). No parser is written for an unseen format.
5. **Monitoring runs inside the worker loop**, not an hourly cron (GitHub delays and skips cron runs). Task 12.

## Global Constraints

- Free official sources only; no AP, NYT, CNN, Fox or other licensed aggregators. No evasion of bot protection: a blocked state becomes a link-out state.
- No hand entry of results. `data/config/live_overrides.json` stays only as a kill switch (`live: false`, `pause_states`, `holds` with action `undecided`).
- Calls are labelled "Bellwether call" and never attributed to anyone else. Odds are written "X in 100". Symmetric wording and colours, no adjectives about candidates.
- Never invent polls, results, candidates, dates or closing times. Missing data is shown as missing. Races with no automatic source say "Results at [state's site]" with a link and a last-checked time.
- Polite fetching: per-host throttle (`bellwether/http.py`), descriptive User-Agent (`BELLWETHER_USER_AGENT`).
- The 10 states that redrew House maps for 2026 (AL, CA, FL, LA, MO, NC, OH, TN, TX, UT) must never be matched to pre-2026 district data. County baselines are used for **statewide** races only; House races always use unit-count mode.
- Mail-heavy states: AZ, CA, CO, NV, OR, UT, WA (stricter rules).
- Python 3.11, `pytest -q` must pass in `pipeline/`; `npm --prefix web run test:live`, `npx tsc --noEmit` and `next build` must pass in `web/`.
- Feature freeze **Oct. 25** (only reader fixes after); rehearsals Oct. 26 and Oct. 29-30; go/no-go Nov. 1; election Nov. 3 (polls close from 6 p.m. ET; Nov. 3 is after the Nov. 1 end of daylight time, so ET = UTC-5).
- Commit messages end with the Co-Authored-By line from the session's attribution reminder. Push feature branches only; the owner merges to `main` (merging deploys to production).

## Review Focus

Inputs and conditions the spec implies but no obvious test covers, most likely to bite first. Each has a test in the owning task.

1. **Independent or oddly named principal** (e.g. an independent is the forecast's D-side; a "Democratic field" principal): votes must still land on the right side. Task 2.
2. **County names that do not match the baseline** (St./Saint, DeKalb/De Kalb, parishes): fall back to unit-count mode, never crash, never mis-assign. Tasks 3-4.
3. **Feed quirks:** `units_total` 0 or `units_reporting` > `units_total`, votes reported before polls close, a state going stale or paused after it was called. No call before close; no crash; existing calls stay visible and labelled. Tasks 4, 5, 9.
4. **Runoff / ranked-choice / all-party-primary races and special elections** (`-sp` ids): a leader at or under 50% is never called. Task 4.
5. **Worker restart between chained jobs:** the next job must start from the last published results, so "votes went down" checks and call history survive. Task 9.
6. **Time zones:** closing times convert to UTC with ET = UTC-5 on Nov. 3; multi-timezone states wait for the last closing. Task 5.
7. **Expected vote wrong by +/-25%, and late-counted votes leaning against the leader.** The acceptance simulation uses both. Task 5 (validation).

## File Structure

New (all under `pipeline/bellwether/results/` unless noted):
- `data/config/call_rules.json` - thresholds and mail-heavy list, the single source of truth.
- `rules.py` - loads `call_rules.json`. `sides.py` - which candidate is the D/R side; `Tally`. `baseline.py` - county baseline loader and name normaliser.
- `calls.py` - `Projection`, `project`, `Call`, `decide_call`, `CallBook`. `schedule.py` - poll-closing times as UTC. `chamber.py` - seat counts and control.
- `context.py` - everything the worker needs besides the feeds (`Context`, `load_context`). `persist.py` - load the previous published files at startup. `alerts.py` - open GitHub issues from inside the loop.
- `county_agg.py` - combine county feeds into a statewide result.
- `pipeline/tools/county_baseline.py` - builds `data/config/county_baseline.json`. `pipeline/tools/rehearse_night.py`, `pipeline/tools/load_test.py`.
- Web: `web/lib/livehome.ts` (pure selectors), `web/components/LiveHome.tsx`, `web/components/StateLive.tsx`.
- Tests: `pipeline/tests/test_calls.py`, `test_calls_sim.py`, `test_sides.py`, `test_baseline.py`, `test_schedule.py`, `test_chamber.py`, `test_worker_calls.py`, `test_county_agg.py`; `web/lib/livehome.test.ts`.

Modified: `results/worker.py`, `results/run.py`, `results/model.py` (coverage field), `publish.py` (governor draws), `web/lib/livefeed.ts`, `web/lib/live.ts`, `web/components/LiveRacePanel.tsx`, `web/app/(site)/page.tsx`, `.github/workflows/election-night.yml`, docs.

## Order and dates

Critical path first; readers after, each shipping a usable result alone.

| By | Tasks |
|---|---|
| Oct. 9 | 1-6 (rules, sides, baseline, call engine, validation, call book) |
| Oct. 14 | 7-9 (closing times, chamber + governor draws, worker integration + persistence) |
| Oct. 18 | 10-12 (web panel reads calls, live home, alerts + auto-start) |
| Oct. 25 (freeze) | 13-17 (link-outs and status, county aggregation, readers as fixtures allow) |
| Oct. 26-30 | 18-19 (rehearsal harness and drills, load test) |
| Nov. 1 | 20 (runbook, go/no-go) |

---

### Task 1: Shared call rules (one source of truth) with parity test

**Files:**
- Create: `data/config/call_rules.json`, `pipeline/bellwether/results/rules.py`, `pipeline/tests/test_rules.py`

**Interfaces:**
- Produces: `rules.RULES: dict` (loaded JSON), `rules.is_mail_heavy(state: str) -> bool`, `rules.mode_key(mode: str, mail_heavy: bool) -> str` (e.g. `"units_mail"`), `rules.p_call() -> float`.

- [ ] **Step 1: Write the config**

```json
{
 "_about": "Thresholds for automatic Bellwether calls. Python (pipeline/bellwether/results/calls.py) and the rehearsal demo (web/lib/live.ts) both read these values; a parity test fails if they drift. Values were tuned by pipeline/tests/test_calls_sim.py; see docs/call-validation.md. The owner approves the final numbers.",
 "p_call": 0.9999,
 "close_band": 1.0,
 "cushion": 1.10,
 "prior_ratio": 0.72,
 "mail_heavy": ["AZ", "CA", "CO", "NV", "OR", "UT", "WA"],
 "modes": {
  "units":        {"late_sd": 24.0, "min_share": 0.80},
  "units_mail":   {"late_sd": 30.0, "min_share": 0.85},
  "county":       {"late_sd": 12.0, "min_share": 0.50},
  "county_mail":  {"late_sd": 20.0, "min_share": 0.70}
 }
}
```

- [ ] **Step 2: Write the failing tests**

```python
# pipeline/tests/test_rules.py
import re
from pathlib import Path

from bellwether.results import rules

ROOT = Path(__file__).resolve().parents[2]


def test_mail_heavy_and_mode_keys():
    assert rules.is_mail_heavy("CA") and not rules.is_mail_heavy("OH")
    assert rules.mode_key("units", True) == "units_mail"
    assert rules.mode_key("county", False) == "county"
    assert 0.99 < rules.p_call() < 1


def test_web_demo_uses_the_same_mail_heavy_states():
    ts = (ROOT / "web" / "lib" / "live.ts").read_text()
    m = re.search(r"MAIL_HEAVY_STATES\s*=\s*\[([^\]]*)\]", ts)
    assert m, "MAIL_HEAVY_STATES not found in web/lib/live.ts"
    web = sorted(re.findall(r'"([A-Z]{2})"', m.group(1)))
    assert web == sorted(rules.RULES["mail_heavy"])
```

- [ ] **Step 3: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_rules.py`
Expected: FAIL (`ModuleNotFoundError: bellwether.results.rules`)

- [ ] **Step 4: Implement**

```python
# pipeline/bellwether/results/rules.py
"""Call thresholds, loaded once from data/config/call_rules.json (the single source of truth)."""
from __future__ import annotations

import json
from pathlib import Path

PATH = Path(__file__).resolve().parents[3] / "data" / "config" / "call_rules.json"
RULES: dict = json.loads(PATH.read_text())


def is_mail_heavy(state: str) -> bool:
    return state in RULES["mail_heavy"]


def mode_key(mode: str, mail_heavy: bool) -> str:
    return f"{mode}_mail" if mail_heavy else mode


def p_call() -> float:
    return float(RULES["p_call"])
```

- [ ] **Step 5: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_rules.py`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add data/config/call_rules.json pipeline/bellwether/results/rules.py pipeline/tests/test_rules.py
git commit -m "Shared call rules config with Python/web parity test"
```

---

### Task 2: Which side is which (`sides.py`) and vote tallies

**Files:**
- Create: `pipeline/bellwether/results/sides.py`, `pipeline/tests/test_sides.py`

**Interfaces:**
- Consumes: `model.Cand`, `model.RaceResult`.
- Produces:
  - `last_name(s: str | None) -> str`
  - `side_of(c: Cand, dname: str | None, rname: str | None) -> str` returning `"d" | "r" | "o"`
  - `@dataclass Tally(d: int, r: int, o: int, party_pure: bool)` with properties `total: int`, `margin: float` (D-side minus R-side, percent of all votes; `0.0` if no votes)
  - `tally(race: RaceResult, info: dict) -> Tally`
  - `load_sides(path=RACES_JSON) -> dict[str, dict]` keyed by race id; each value has keys `dname, dparty, rname, rparty, rules, office, kind, state`.

- [ ] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_sides.py
from bellwether.results.model import Cand, RaceResult
from bellwether.results.sides import last_name, load_sides, side_of, tally


def race(cands):
    return RaceResult("2026-sen-NE", "NE", cands, 5, 10, "test")


INFO = {"dname": "Dan Osborn", "dparty": "I", "rname": "Pete Ricketts", "rparty": "R"}


def test_last_name_ignores_suffixes_and_blanks():
    assert last_name("Martin Luther King Jr.") == "king"
    assert last_name("  ") == "" and last_name(None) == ""


def test_independent_principal_counts_on_the_d_side():
    t = tally(race([Cand("Dan Osborn", "O", 480), Cand("Pete Ricketts", "R", 500), Cand("A Libertarian", "O", 20)]), INFO)
    assert (t.d, t.r, t.o) == (480, 500, 20)
    assert t.party_pure is False            # the D-side is not a Democrat: county mode must not use party letters
    assert round(t.margin, 1) == -2.0 and t.total == 1000


def test_party_letter_is_the_fallback_for_a_field_principal():
    info = {"dname": "Democratic field", "dparty": "D", "rname": "Republican field", "rparty": "R"}
    t = tally(race([Cand("Ann Lee", "D", 600), Cand("Bo Ray", "R", 400)]), info)
    assert (t.d, t.r, t.o) == (600, 400, 0) and t.party_pure is True


def test_no_votes_is_a_zero_margin_not_a_crash():
    t = tally(race([Cand("Dan Osborn", "O", 0), Cand("Pete Ricketts", "R", 0)]), INFO)
    assert t.total == 0 and t.margin == 0.0


def test_load_sides_reads_the_published_races_file():
    sides = load_sides()
    assert "2026-sen-GA" in sides and sides["2026-sen-GA"]["state"] == "GA"
    assert {"dname", "rname", "rules", "kind", "office"} <= set(sides["2026-sen-GA"])
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_sides.py`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement**

```python
# pipeline/bellwether/results/sides.py
"""Which candidates are the forecast's D-side and R-side for a race, and the vote tally on that basis.

The forecast's "D-side" is the main non-Republican (an independent in Nebraska); feeds only give a candidate name and a party
letter, so we match by surname against the forecast's principals first and fall back to the party letter."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .model import Cand, RaceResult

RACES_JSON = Path(__file__).resolve().parents[3] / "web" / "public" / "data" / "races.json"


def last_name(s: str | None) -> str:
    s = re.sub(r",?\s+(jr|sr|ii|iii|iv)\.?$", "", (s or "").strip(), flags=re.I)
    parts = s.split()
    return parts[-1].lower() if parts else ""


def side_of(c: Cand, dname: str | None, rname: str | None) -> str:
    cl = last_name(c.name)
    if cl and cl == last_name(dname):
        return "d"
    if cl and cl == last_name(rname):
        return "r"
    return {"D": "d", "R": "r"}.get(c.party, "o")


@dataclass
class Tally:
    d: int
    r: int
    o: int
    party_pure: bool   # D-side is a Democrat and R-side a Republican, so county D/R columns line up with the sides

    @property
    def total(self) -> int:
        return self.d + self.r + self.o

    @property
    def margin(self) -> float:
        return (self.d - self.r) / self.total * 100 if self.total else 0.0


def tally(race: RaceResult, info: dict) -> Tally:
    d = r = o = 0
    for c in race.cands:
        s = side_of(c, info["dname"], info["rname"])
        if s == "d":
            d += c.votes
        elif s == "r":
            r += c.votes
        else:
            o += c.votes
    return Tally(d, r, o, info.get("dparty") == "D" and info.get("rparty") == "R")


def load_sides(path: Path = RACES_JSON) -> dict[str, dict]:
    out = {}
    for row in json.loads(path.read_text()):
        out[row["id"]] = {"dname": (row.get("dside") or {}).get("name"), "dparty": (row.get("dside") or {}).get("party"),
                          "rname": (row.get("rside") or {}).get("name"), "rparty": (row.get("rside") or {}).get("party"),
                          "rules": row.get("rules") or {}, "office": row["office"], "kind": row["kind"], "state": row["state"]}
    return out
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_sides.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/bellwether/results/sides.py pipeline/tests/test_sides.py
git commit -m "Results: D/R side matching and tallies, including independents"
```

---

### Task 3: County baseline (2024 presidential by county) and research of a 2022 source

**Files:**
- Create: `pipeline/bellwether/results/baseline.py`, `pipeline/tools/county_baseline.py`, `pipeline/tests/test_baseline.py`, `data/config/county_baseline.json` (generated), `docs/county-baseline-sources.md`

**Interfaces:**
- Produces: `baseline.norm_county(name: str) -> str`; `baseline.load(path=BASELINE) -> dict[str, dict[str, list[int]]]` mapping state -> normalised county -> `[dem, gop, total]`; `baseline.BASELINE: Path`; `county_baseline.build(text: str) -> dict` (same shape).

- [ ] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_baseline.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import county_baseline  # noqa: E402
from bellwether.results.baseline import norm_county  # noqa: E402

CSV = """state_name,county_fips,county_name,votes_gop,votes_dem,total_votes
Georgia,13121,Fulton County,100,300,420
Georgia,13089,DeKalb County,50,250,320
Missouri,29510,St. Louis city,40,120,170
Louisiana,22071,Orleans Parish,30,160,200
"""


def test_names_normalise_the_way_feeds_spell_them():
    assert norm_county("Fulton County") == norm_county("FULTON") == "fulton"
    assert norm_county("St. Louis city") == norm_county("Saint Louis City") == "st louis city"
    assert norm_county("Orleans Parish") == "orleans"
    assert norm_county("De Kalb") == norm_county("DeKalb")


def test_build_groups_by_state_abbreviation():
    b = county_baseline.build(CSV)
    assert b["GA"]["fulton"] == [300, 100, 420]
    assert b["GA"]["dekalb"] == [250, 50, 320]
    assert b["LA"]["orleans"][2] == 200 and "st louis city" in b["MO"]
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_baseline.py`
Expected: FAIL (`ModuleNotFoundError: county_baseline`)

- [ ] **Step 3: Implement the loader and normaliser**

```python
# pipeline/bellwether/results/baseline.py
"""2024 presidential results by county, keyed by state and a normalised county name, used as the geography of the vote still out.
Not authoritative (see docs/county-baseline-sources.md); it only shapes projections, it is never shown as a result."""
from __future__ import annotations

import json
import re
from pathlib import Path

BASELINE = Path(__file__).resolve().parents[3] / "data" / "config" / "county_baseline.json"


def norm_county(name: str) -> str:
    s = (name or "").lower().strip()
    s = re.sub(r"\bsaint\b", "st", s)
    s = re.sub(r"\b(county|parish|borough|census area|municipality|city and borough)\b", " ", s)   # a trailing "city" stays: St. Louis city is not St. Louis County
    s = re.sub(r"\bde\s+kalb\b", "dekalb", s)
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def load(path: Path = BASELINE) -> dict[str, dict[str, list[int]]]:
    return json.loads(path.read_text()) if path.exists() else {}
```

- [ ] **Step 4: Implement the builder tool**

```python
# pipeline/tools/county_baseline.py
"""Build data/config/county_baseline.json from the 2024 presidential county CSV (same source as the county maps).

  python pipeline/tools/county_baseline.py
Shape: {"GA": {"fulton": [dem, gop, total], ...}, ...}"""
from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bellwether.results.baseline import BASELINE, norm_county  # noqa: E402
from bellwether.states import STATES  # noqa: E402

URL = "https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2024_US_County_Level_Presidential_Results.csv"


def build(text: str) -> dict[str, dict[str, list[int]]]:
    out: dict[str, dict[str, list[int]]] = {}
    for r in csv.DictReader(io.StringIO(text)):
        st = STATES.get(r["state_name"])
        if not st or not r.get("county_fips"):
            continue
        row = out.setdefault(st, {}).setdefault(norm_county(r["county_name"]), [0, 0, 0])
        row[0] += int(r["votes_dem"])
        row[1] += int(r["votes_gop"])
        row[2] += int(r["total_votes"])
    return out


if __name__ == "__main__":
    from bellwether import http
    data = build(http.fetch(URL, max_age_s=86400).decode("utf-8"))
    BASELINE.write_text(json.dumps(data, separators=(",", ":"), sort_keys=True))
    print(f"{sum(len(v) for v in data.values())} counties in {len(data)} states -> {BASELINE}")
```

- [ ] **Step 5: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_baseline.py`
Expected: PASS. (If the St. Louis city assertion fails, fix `norm_county` so "St. Louis city" and "Saint Louis City" both give `st louis city` while "Fulton County" gives `fulton`; keep the test as written.)

- [ ] **Step 6: Generate the baseline and record sources (research step)**

Run: `python3 pipeline/tools/county_baseline.py`
Expected: prints roughly 3,100 counties in 51 areas. Then confirm every county that the forecast's statewide races could report is present: `python3 -c "from bellwether.results import baseline; b=baseline.load(); print(sorted(len(v) for v in b.values())[:5])"` (run from `pipeline/`).

Research: look for a real, downloadable 2022 county-level returns file (try MIT Election Data + Science Lab "County Returns" on Harvard Dataverse, and state certified-results pages). **Write what you actually find, with URLs and licence, into `docs/county-baseline-sources.md`; if none is usable, say so there.** The engine works without it (it learns the turnout ratio from the live count; `prior_ratio` 0.72 is a stated assumption, see Task 4). Do not add a 2022 file you cannot cite.

- [ ] **Step 7: Commit**

```bash
git add pipeline/bellwether/results/baseline.py pipeline/tools/county_baseline.py pipeline/tests/test_baseline.py data/config/county_baseline.json docs/county-baseline-sources.md
git commit -m "County baseline: 2024 presidential by county, with name normaliser"
```

---

### Task 4: Projection and the call decision (`calls.py`)

**Files:**
- Create: `pipeline/bellwether/results/calls.py`, `pipeline/tests/test_calls.py`

**Interfaces:**
- Consumes: `rules.RULES`, `rules.is_mail_heavy`, `rules.mode_key`, `sides.Tally`, `sides.tally`, `baseline.norm_county`, `model.RaceResult`.
- Produces:
  - `norm_cdf(x: float) -> float`
  - `@dataclass Projection(margin: float, sd: float, counted: int, expected: float, f: float, mode: str)` (`mode` is `"county"` or `"units"`; margin is D-side minus R-side in percent of total vote)
  - `project(t: Tally, race: RaceResult, base: dict | None, mail_heavy: bool) -> Projection | None`
  - `@dataclass Call(race_id: str, state: str, winner: str | None, leader: str | None, p_leader: float | None, margin: float | None, sd: float | None, mode: str | None, reason: str)`; `state` is one of `waiting | counting | close | called | runoff | rcv | primary`; `winner`/`leader` are `"dside" | "rside" | None`.
  - `decide_call(race: RaceResult, info: dict, baseline: dict, closed: bool) -> Call`

- [ ] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_calls.py
from bellwether.results.calls import decide_call, norm_cdf, project
from bellwether.results.model import Cand, RaceResult
from bellwether.results.sides import tally

INFO = {"dname": "Ann Lee", "dparty": "D", "rname": "Bo Ray", "rparty": "R", "rules": {}, "office": "senate", "kind": "two_party", "state": "GA"}
BASE = {"GA": {"big": [600, 400, 1000], "small": [200, 300, 500], "other": [250, 250, 500]}}   # [dem, gop, total]


def race(d, r, units=(90, 100), counties=None, rid="2026-sen-GA", state="GA"):
    return RaceResult(rid, state, [Cand("Ann Lee", "D", d), Cand("Bo Ray", "R", r)], units[0], units[1], "test", counties=counties)


def test_norm_cdf():
    assert abs(norm_cdf(0) - 0.5) < 1e-9 and norm_cdf(4) > 0.9999


def test_nothing_is_called_before_polls_close():
    c = decide_call(race(700_000, 300_000, (99, 100)), INFO, BASE, closed=False)
    assert c.state == "waiting" and c.winner is None


def test_units_mode_calls_a_blowout_late_and_not_a_modest_lead_early():
    late = decide_call(race(700_000, 300_000, (92, 100)), INFO, BASE, closed=True)
    assert late.state == "called" and late.winner == "dside" and late.mode == "units"
    early = decide_call(race(700_000, 300_000, (30, 100)), INFO, BASE, closed=True)
    assert early.state == "counting" and "early" in early.reason.lower()
    modest = decide_call(race(520_000, 480_000, (90, 100)), INFO, BASE, closed=True)
    assert modest.state == "counting" and modest.leader == "dside"


def test_close_band_is_never_called():
    c = decide_call(race(502_000, 498_000, (100, 100)), INFO, BASE, closed=True)
    assert c.state == "close" and c.winner is None


def test_bad_unit_counts_never_call_and_never_crash():
    for units in ((0, 0), (5, 0), (101, 100), (0, 100)):
        c = decide_call(race(700_000, 300_000, units), INFO, BASE, closed=True)
        assert c.state in ("counting", "waiting") and c.winner is None


def test_mail_heavy_state_needs_more_counted():
    same = dict(d=700_000, r=300_000, units=(82, 100))
    assert decide_call(race(**{k: v for k, v in same.items()}), INFO, BASE, closed=True).state == "called"          # Georgia: 80% is enough
    ca = race(same["d"], same["r"], same["units"], rid="2026-sen-CA", state="CA")
    assert decide_call(ca, {**INFO, "state": "CA"}, {}, closed=True).state == "counting"                              # California needs 85%


def test_runoff_races_are_not_called_at_or_under_fifty_percent():
    info = {**INFO, "rules": {"runoff": True}}
    r = RaceResult("2026-sen-GA", "GA", [Cand("Ann Lee", "D", 480_000), Cand("Bo Ray", "R", 380_000), Cand("Third", "O", 140_000)], 100, 100, "t")
    c = decide_call(r, info, BASE, closed=True)
    assert c.state == "runoff" and c.winner is None


COUNTY_BASE = {"GA": {"big": [600_000, 400_000, 1_000_000], "small": [200_000, 300_000, 500_000], "other": [250_000, 250_000, 500_000]}}


def test_county_mode_projects_the_vote_still_out_by_geography():
    # Big is fully counted (60/40); Small (a 40/60 county) is only 100k of its ~360k; Other has barely started.
    counties = {"Big": [432_000, 288_000, 0], "Small": [40_000, 60_000, 0], "Other": [10_000, 10_000, 0]}
    r = race(482_000, 358_000, (2, 3), counties=counties)
    p = project(tally(r, INFO), r, COUNTY_BASE, False)
    assert p is not None and p.mode == "county"
    assert abs(p.margin - 5.0) < 0.1            # the naive count says 14.8 points; the remaining vote is in Republican-leaning counties
    assert p.margin < tally(r, INFO).margin


def test_county_names_that_do_not_match_fall_back_to_units_mode():
    counties = {"Zzz": [60_000, 40_000, 0], "Yyy": [10_000, 15_000, 0], "Xxx": [5, 5, 0]}
    r = race(70_000, 55_000, (60, 100), counties=counties)
    p = project(tally(r, INFO), r, COUNTY_BASE, False)
    assert p is not None and p.mode == "units"


def test_independent_dside_never_uses_county_mode():
    info = {**INFO, "dparty": "I", "dname": "Ann Lee"}
    counties = {"Big": [432_000, 288_000, 0], "Small": [40_000, 60_000, 0], "Other": [10_000, 10_000, 0]}
    r = race(482_000, 358_000, (2, 3), counties=counties)
    assert project(tally(r, info), r, COUNTY_BASE, False).mode == "units"
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_calls.py`
Expected: FAIL (`ModuleNotFoundError: bellwether.results.calls`)

- [ ] **Step 3: Implement `calls.py`**

```python
# pipeline/bellwether/results/calls.py
"""Automatic "Bellwether calls". One decision for the whole site: the worker computes it, the pages display it.

Principle: every heuristic errs toward "not yet". A race is called only when ALL hold:
  1. the state's last polls have closed,
  2. enough of the expected vote is counted (more in mail-heavy states),
  3. the projected lead is outside the close band,
  4. the leader's chance of winning is at least `p_call` (default 99.99%),
  5. for runoff / ranked-choice / all-party-primary races, the leader is above 50%.
Two projections: "county" (swing from reporting counties applied to the counties still out, statewide races with county detail whose
names match the 2024 baseline) and "units" (the plain count, spread widened for what is still out)."""
from __future__ import annotations

from dataclasses import dataclass
from math import erf, sqrt

from . import rules
from .baseline import norm_county
from .model import RaceResult
from .sides import Tally, tally

HOLD_P = 0.95    # a call stays while the same side leads with at least this chance (see CallBook)


def norm_cdf(x: float) -> float:
    return 0.5 * (1 + erf(x / sqrt(2)))


@dataclass
class Projection:
    margin: float
    sd: float
    counted: int
    expected: float
    f: float
    mode: str


@dataclass
class Call:
    race_id: str
    state: str
    winner: str | None
    leader: str | None
    p_leader: float | None
    margin: float | None
    sd: float | None
    mode: str | None
    reason: str


def _mode_rules(mode: str, mail: bool) -> dict:
    return rules.RULES["modes"][rules.mode_key(mode, mail)]


def _units_projection(t: Tally, race: RaceResult, mail: bool) -> Projection | None:
    if race.units_total <= 0 or race.units_reporting <= 0 or race.units_reporting > race.units_total or t.total <= 0:
        return None
    f = race.units_reporting / race.units_total
    expected = t.total / f
    cushion = rules.RULES["cushion"]
    rem_share = max(0.0, cushion * expected - t.total) / (cushion * expected)
    return Projection(t.margin, max(0.15, rem_share * _mode_rules("units", mail)["late_sd"]), t.total, expected, f, "units")


def _county_projection(t: Tally, race: RaceResult, base: dict, mail: bool) -> Projection | None:
    if not race.counties or not t.party_pure or not base or t.total <= 0:
        return None
    rows = []   # (counted votes, margin %, baseline margin %, baseline total, key)
    for name, (d, r, o) in race.counties.items():
        key = norm_county(name)
        b = base.get(key)
        tot = d + r + o
        if b is None or b[2] <= 0 or tot <= 0:
            continue
        rows.append((tot, (d - r) / tot * 100, (b[0] - b[1]) / b[2] * 100, b[2], key))
    if len(rows) < max(3, int(0.8 * len(race.counties))):
        return None   # names do not line up with the baseline: the caller falls back to unit counts
    ratios = sorted(tot / bt for tot, _, _, bt, _ in rows)
    ratio = max(rules.RULES["prior_ratio"], ratios[int(0.9 * (len(ratios) - 1))])   # err high: more vote left
    counted_by = {key: tot for tot, _, _, _, key in rows}
    rem = {k: max(0.0, ratio * b[2] - counted_by.get(k, 0)) for k, b in base.items() if b[2] > 0}
    expected = t.total + sum(rem.values())
    w = sum(tot for tot, *_ in rows)
    swing = sum(tot * (m - bm) for tot, m, bm, _, _ in rows) / w
    var = sum(tot * (m - bm - swing) ** 2 for tot, m, bm, _, _ in rows) / w
    neff = w * w / sum(tot * tot for tot, *_ in rows)
    swing_sd = max(1.5, sqrt(var) / sqrt(max(neff, 1.0)))
    rem_votes_margin = sum(rem[k] * ((base[k][0] - base[k][1]) / base[k][2] * 100 + swing) / 100 for k in rem)
    final = ((t.d - t.r) + rem_votes_margin) / expected * 100
    cushion = rules.RULES["cushion"]
    rem_share = max(0.0, cushion * expected - t.total) / (cushion * expected)
    sd = max(0.15, rem_share * sqrt(swing_sd ** 2 + _mode_rules("county", mail)["late_sd"] ** 2))
    return Projection(final, sd, t.total, expected, t.total / expected, "county")


def project(t: Tally, race: RaceResult, base: dict | None, mail_heavy: bool) -> Projection | None:
    return _county_projection(t, race, (base or {}).get(race.state, {}), mail_heavy) or _units_projection(t, race, mail_heavy)


def _call(race: RaceResult, state: str, reason: str, **kw) -> Call:
    return Call(race.race_id, state, kw.get("winner"), kw.get("leader"), kw.get("p"), kw.get("margin"), kw.get("sd"), kw.get("mode"), reason)


def decide_call(race: RaceResult, info: dict, baseline: dict, closed: bool) -> Call:
    if not closed:
        return _call(race, "waiting", "Polls have not all closed in this state yet")
    t = tally(race, info)
    if t.total <= 0:
        return _call(race, "waiting", "No results yet")
    mail = rules.is_mail_heavy(race.state)
    proj = project(t, race, baseline, mail)
    if proj is None:
        return _call(race, "counting", "The feed does not say how many precincts have reported, so we cannot tell how much is left")
    leader = "dside" if proj.margin > 0 else "rside"
    p = norm_cdf(abs(proj.margin) / proj.sd)
    common = dict(leader=leader, p=p, margin=proj.margin, sd=proj.sd, mode=proj.mode)
    need = _mode_rules(proj.mode, mail)["min_share"]
    if proj.f < need:
        return _call(race, "counting", f"Too early: {proj.f * 100:.0f}% counted; this race needs {need * 100:.0f}%" +
                     (" (this state counts many mail ballots late)" if mail else ""), **common)
    third = t.o / t.total * 100
    leader_share = (100 - third + abs(t.margin)) / 2
    for key, label in (("runoff", "runoff"), ("rcv", "rcv"), ("jungle_nov", "primary")):
        if info.get("rules", {}).get(key) and leader_share <= 50:
            return _call(race, label, {"runoff": "Nobody is above 50%, so this goes to a runoff if it holds",
                                       "rcv": "Ranked-choice race: first-round counts only; the ranked-choice count comes later",
                                       "primary": "All-party primary: the top two advance unless someone passes 50%"}[label], **common)
    if abs(proj.margin) < rules.RULES["close_band"]:
        return _call(race, "close", "Within one point: too close to call", **common)
    if (t.margin > 0) != (proj.margin > 0):
        return _call(race, "counting", "The count so far and the projection disagree on who leads", **common)
    if p >= rules.p_call():
        return _call(race, "called", f"Leads by {abs(proj.margin):.1f} points with {proj.f * 100:.0f}% counted; the vote still out is very unlikely "
                     f"to change that (at least 99 in 100)", winner=leader, **common)
    return _call(race, "counting", f"Leading by {abs(proj.margin):.1f} points, but the vote still out could change that", **common)
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_calls.py`
Expected: PASS. If `test_units_mode_calls_a_blowout_late` fails, the thresholds in `call_rules.json` are wrong, not the test: at 92% reporting the unit-mode spread is `(1 - 0.92/1.1) * 24 = 3.9` points, so a 40-point lead is far past `p_call`. Recompute with the formula in `_units_projection` and fix the config.

- [ ] **Step 5: Commit**

```bash
git add pipeline/bellwether/results/calls.py pipeline/tests/test_calls.py
git commit -m "Call engine: county and unit-count projections, strict call decision"
```

---

### Task 5: Validation simulations (units mode and county mode) and `docs/call-validation.md`

**Files:**
- Create: `pipeline/tests/test_calls_sim.py`, `docs/call-validation.md`

**Interfaces:**
- Consumes: `calls.decide_call`, `model.RaceResult`, `model.Cand`.

The point of this task is a test that can actually fail. Both simulations are adversarial: the early count leans toward the eventual loser, and the engine's view of "share counted" is wrong by up to +/-25%. County mode also makes late-counted (urban) counties lean against the leader relative to the 2024 baseline.

- [ ] **Step 1: Write the units-mode simulation**

```python
# pipeline/tests/test_calls_sim.py
import random

from bellwether.results.calls import decide_call
from bellwether.results.model import Cand, RaceResult

INFO = {"dname": "A D", "dparty": "D", "rname": "B R", "rparty": "R", "rules": {}, "office": "senate", "kind": "two_party", "state": "OH"}
TOTAL = 500_000


def night(sigma: float, state: str, n: int, seed: int, expected_err: float = 0.25):
    """Returns (wrong calls, races called, wrong among close races, close races called)."""
    rng = random.Random(seed)
    wrong = called = close_wrong = close_called = 0
    info = {**INFO, "state": state}
    for i in range(n):
        final = rng.gauss(0, 15)                       # true final margin, points
        lean = abs(rng.gauss(0, sigma))                 # early count leans toward the eventual LOSER by up to this much
        err = rng.uniform(-expected_err, expected_err)  # units reporting overstates or understates the share of votes counted
        sign = 1 if final > 0 else -1
        for step in range(40, 101, 2):
            f = step / 100
            cur = final - sign * lean * (1 - f)
            counted = int(TOTAL * f)
            d = int(counted * (50 + cur / 2) / 100)
            race = RaceResult(f"2026-sen-{state}", state, [Cand("A D", "D", d), Cand("B R", "R", counted - d)],
                              int(1000 * min(1.0, f * (1 + err))), 1000, "sim")
            c = decide_call(race, info, {}, closed=True)
            if c.state == "called":
                called += 1
                bad = (c.winner == "dside") != (final > 0)
                wrong += bad
                if abs(final) < 5:
                    close_called += 1
                    close_wrong += bad
                break
    return wrong, called, close_wrong, close_called


def test_units_mode_zero_wrong_calls_through_a_16_point_early_lean():
    for sigma in (0, 8, 12, 16):
        wrong, called, *_ = night(sigma, "OH", 1500, seed=11)
        assert called > 0 and wrong == 0, f"sigma={sigma}: {wrong} wrong of {called}"


def test_units_mode_mail_heavy_zero_wrong_calls_through_a_20_point_early_lean():
    for sigma in (0, 8, 12, 16, 20):
        wrong, called, *_ = night(sigma, "CA", 1500, seed=12)
        assert called > 0 and wrong == 0, f"sigma={sigma}: {wrong} wrong of {called}"


def test_units_mode_rate_at_a_20_point_lean_is_tiny():
    wrong, called, *_ = night(20, "OH", 1500, seed=13)
    assert wrong / max(called, 1) <= 0.001, f"{wrong} wrong of {called}; record the number in docs/call-validation.md and tighten call_rules.json"
```

- [ ] **Step 2: Run, and tune only the config**

Run: `python3 -m pytest -q pipeline/tests/test_calls_sim.py`
Expected: PASS with the default `call_rules.json`. If any test fails, **do not loosen a test or shrink the sigma range**: raise `p_call`, raise `modes.units(_mail).late_sd` or `min_share` in `data/config/call_rules.json`, and rerun. Record the final numbers in Step 5.

- [ ] **Step 3: Write the county-mode simulation (adversarial geography)**

Add to the same file:

```python
def county_night(sigma_swing: float, late_urban_against: float, n: int, seed: int, state: str = "GA", use_counties: bool = True) -> dict:
    """A state of 20 counties: 14 'rural' report first, 6 'urban' last. All counties swing by a common amount plus noise relative to the 2024
    baseline. The late urban counties then move `late_urban_against` points AGAINST the leader of the count without that move (the dangerous
    case: early rural counties point the wrong way). The truth is the winner of the complete, shifted count, which is exactly what the engine
    sees once all 20 counties are in, so a call made on the full count can never be wrong. `use_counties=False` hides county detail from the
    engine (unit-count mode) so the two modes can be compared on identical nights."""
    rng = random.Random(seed)
    info = {**INFO, "state": state}
    out = {"wrong": 0, "called": 0, "early": 0, "full_wrong": 0}
    for _ in range(n):
        names = [f"c{i}" for i in range(20)]
        base, votes_by, m_by = {}, {}, {}
        common = rng.gauss(0, sigma_swing)
        for i, name in enumerate(names):
            urban = i >= 14
            tot = rng.randint(40_000, 120_000) if urban else rng.randint(5_000, 40_000)
            bm = rng.gauss(20 if urban else -15, 8)                           # 2024 baseline margin, %
            base[name] = [int(tot * (50 + bm / 2) / 100), int(tot * (50 - bm / 2) / 100), tot]
            votes_by[name] = int(0.72 * tot)
            m_by[name] = bm + common + rng.gauss(0, 3)

        def tallies(m_map):
            res = {}
            for name in names:
                d = int(votes_by[name] * (50 + m_map[name] / 2) / 100)
                res[name] = [d, votes_by[name] - d, 0]
            return res

        plain = tallies(m_by)
        lead = 1 if sum(v[0] for v in plain.values()) > sum(v[1] for v in plain.values()) else -1
        shifted = {nm: m_by[nm] + (-lead * late_urban_against if i >= 14 else 0) for i, nm in enumerate(names)}
        final = tallies(shifted)
        truth_d = sum(v[0] for v in final.values()) > sum(v[1] for v in final.values())
        for k in range(1, 21):                                                # k counties fully reported, rural first
            counties = {nm: final[nm] for nm in names[:k]}
            d_tot = sum(v[0] for v in counties.values())
            r_tot = sum(v[1] for v in counties.values())
            race = RaceResult(f"2026-sen-{state}", state, [Cand("A D", "D", d_tot), Cand("B R", "R", r_tot)], k, 20, "sim",
                              counties=counties if use_counties else None)
            c = decide_call(race, info, {state: base}, closed=True)
            if c.state == "called":
                bad = (c.winner == "dside") != truth_d
                out["called"] += 1
                out["wrong"] += bad
                out["full_wrong"] += bad and k == 20
                out["early"] += k < 20
                break
    return out


def test_county_mode_zero_wrong_calls_with_adversarial_late_counties():
    for swing, against in ((0, 0), (3, 3), (8, 10), (15, 20), (20, 30)):
        r = county_night(swing, against, 300, seed=21)
        assert r["called"] > 0 and r["early"] > 0, f"swing={swing}: no early calls, which passes 'zero wrong' trivially"
        assert r["wrong"] == 0, f"swing={swing}, late urban against={against}: {r['wrong']} wrong of {r['called']}"
        assert r["full_wrong"] == 0     # a call on the complete count can never be wrong; if this fails the simulation's ground truth is broken


def test_county_mode_mail_heavy_state_is_at_least_as_safe():
    r = county_night(20, 30, 300, seed=22, state="AZ")
    assert r["called"] > 0 and r["wrong"] == 0


def test_county_mode_calls_earlier_than_unit_counts_on_the_same_nights():
    with_counties = county_night(3, 3, 300, seed=23)
    without = county_night(3, 3, 300, seed=23, use_counties=False)
    assert with_counties["early"] > without["early"], (with_counties, without)
```

- [ ] **Step 4: Run, and tune county settings only**

Run: `python3 -m pytest -q pipeline/tests/test_calls_sim.py -k county`
Expected: PASS with the default `call_rules.json`. Measured while writing the plan (400 races per cell, truth taken from the complete shifted count):
- County `late_sd` 4 is safe until late urban counties move about 25 points against the early count (3 wrong in 359 at 18/25, 7 in 375 at 20/30). `late_sd` 8 and 12 and 16 gave zero wrong at every scenario through 20/30. The default is **12** (county) and **20** (mail-heavy): safe with headroom.
- On identical nights, county mode called 27% of races before the last county reported; unit-count mode called 10%. County mode called about 19% of the races decided by under 5 points; unit-count mode called essentially none. In a mail-heavy state county mode called 38% of races overall, 8% early, and no race decided by under 5 points. These are synthetic numbers: use them to compare modes, not to predict the night.
- The first draft of this simulation graded calls against the winner of the count *before* the late counties moved, which made correct calls on the full count look wrong (it reported 39% wrong at `late_sd` 4). `test_county_mode_...` therefore also asserts `full_wrong == 0`: a call made on the complete count must never be wrong, so a failure there means the simulation, not the engine, is broken.
If any county test fails, raise `late_sd` or `min_share`; never weaken the test. A config that never calls passes "zero wrong" trivially, which is why the tests also assert early calls happen.

- [ ] **Step 5: Record results**

Create `docs/call-validation.md` with: the simulation design (both), the final `call_rules.json` values, a table of wrong-call counts per sigma and mode, the measured share of races called by 80%, 90% and 95% reporting, and the sentence "Real timing data does not exist; thresholds are deliberately strict and the owner approves the final cutoff after the Oct. 26 rehearsal."

- [ ] **Step 6: Commit**

```bash
git add pipeline/tests/test_calls_sim.py docs/call-validation.md data/config/call_rules.json
git commit -m "Call validation: adversarial simulations for units and county modes"
```

---

### Task 6: Call history with visible withdrawals (`CallBook`)

**Files:**
- Modify: `pipeline/bellwether/results/calls.py` (append)
- Test: `pipeline/tests/test_calls.py` (append)

**Interfaces:**
- Consumes: `calls.Call`, `calls.HOLD_P`.
- Produces: `class CallBook(calls: dict | None = None, log: list | None = None)` with `update(call: Call, now: str) -> dict` returning the published call dict (keys `state, winner, leader, p_leader, margin, sd, mode, reason, called_at, withdrawn_at`), and attributes `.calls: dict[str, dict]`, `.log: list[dict]` (entries `{"at","race_id","event","winner","reason"}`, `event` is `"called"` or `"withdrawn"`; capped to the newest 300).

- [ ] **Step 1: Write the failing tests**

```python
# append to pipeline/tests/test_calls.py
from bellwether.results.calls import Call, CallBook


def mk(state, leader="dside", p=0.99999, rid="r1", winner=None):
    return Call(rid, state, winner or (leader if state == "called" else None), leader, p, 8.0, 1.0, "units", "because")


def test_a_call_is_recorded_once_and_held_while_the_same_side_leads():
    b = CallBook()
    first = b.update(mk("called"), "t1")
    assert first["state"] == "called" and first["called_at"] == "t1"
    held = b.update(mk("counting", p=0.97), "t2")                       # dipped but still the same side at 97 in 100
    assert held["state"] == "called" and held["called_at"] == "t1"
    assert [e["event"] for e in b.log] == ["called"]


def test_a_call_is_withdrawn_visibly_when_the_lead_flips_or_collapses():
    b = CallBook()
    b.update(mk("called"), "t1")
    w = b.update(mk("counting", leader="rside", p=0.6), "t2")
    assert w["state"] == "withdrawn" and w["winner"] == "dside" and w["withdrawn_at"] == "t2" and "withdrawn" in w["reason"].lower()
    again = b.update(mk("counting", leader="rside", p=0.7), "t3")        # stays marked withdrawn until a new call
    assert again["state"] == "withdrawn"
    recalled = b.update(mk("called", leader="rside"), "t4")
    assert recalled["state"] == "called" and recalled["winner"] == "rside"
    assert [e["event"] for e in b.log] == ["called", "withdrawn", "called"]


def test_log_is_capped_and_state_survives_a_restart():
    b = CallBook()
    for i in range(400):
        b.update(mk("called", rid=f"r{i}"), "t")
    assert len(b.log) == 300
    b2 = CallBook(b.calls, b.log)
    assert b2.update(mk("counting", rid="r399", p=0.97), "t9")["state"] == "called"
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_calls.py -k "call_is or log_is"`
Expected: FAIL (`ImportError: CallBook`)

- [ ] **Step 3: Implement**

```python
# append to pipeline/bellwether/results/calls.py
LOG_MAX = 300


class CallBook:
    """Remembers calls across passes (and across worker restarts, via results.json) so a withdrawn call is shown, never silently dropped."""

    def __init__(self, calls: dict | None = None, log: list | None = None):
        self.calls: dict[str, dict] = dict(calls or {})
        self.log: list[dict] = list(log or [])

    def _record(self, now: str, call: Call, event: str, winner: str | None, reason: str) -> None:
        self.log.append({"at": now, "race_id": call.race_id, "event": event, "winner": winner, "reason": reason})
        del self.log[:-LOG_MAX]

    def update(self, call: Call, now: str) -> dict:
        old = self.calls.get(call.race_id)
        fresh = {"state": call.state, "winner": call.winner, "leader": call.leader, "p_leader": call.p_leader, "margin": call.margin,
                 "sd": call.sd, "mode": call.mode, "reason": call.reason, "called_at": None, "withdrawn_at": None}
        numbers = {k: fresh[k] for k in ("leader", "p_leader", "margin", "sd", "mode")}
        if old and old["state"] == "called":
            same = call.leader == old["winner"] and (call.state == "called" or (call.p_leader or 0) >= HOLD_P)
            if same:
                keep = {**old, **numbers}
                self.calls[call.race_id] = keep
                return keep
            fresh.update(state="withdrawn", winner=old["winner"], called_at=old["called_at"], withdrawn_at=now,
                         reason=f"Call withdrawn: {call.reason}")
            self._record(now, call, "withdrawn", old["winner"], fresh["reason"])
        elif old and old["state"] == "withdrawn" and call.state != "called":
            keep = {**old, **numbers}
            self.calls[call.race_id] = keep
            return keep
        elif call.state == "called":
            fresh["called_at"] = now
            self._record(now, call, "called", call.winner, call.reason)
        if call.state == "called" and fresh["called_at"] is None:
            fresh["called_at"] = now
            self._record(now, call, "called", call.winner, call.reason)
        self.calls[call.race_id] = fresh
        return fresh
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_calls.py`
Expected: PASS. (In `test_a_call_is_withdrawn...`, the third update re-calls with the *other* side while the old state is `withdrawn`: it falls to the last `if`, which records a new "called".)

- [ ] **Step 5: Commit**

```bash
git add pipeline/bellwether/results/calls.py pipeline/tests/test_calls.py
git commit -m "Call history: calls are held, withdrawals are visible and logged"
```

---

### Task 7: Poll-closing times as UTC (`schedule.py`)

**Files:**
- Create: `pipeline/bellwether/results/schedule.py`, `pipeline/tests/test_schedule.py`

**Interfaces:**
- Consumes: `web/public/data/schedule.json` (written by `publish.poll_schedule`; each state row has `first` and `last`, minutes after 12:00 noon ET, `None` when unknown).
- Produces: `load(path=SCHEDULE) -> dict`; `last_close_utc(state: str, sched: dict) -> datetime | None`; `first_close_utc(sched: dict) -> datetime | None`; `polls_closed(state: str, now: datetime, sched: dict) -> bool` (False when the closing time is unknown: never call without a known close).

- [ ] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_schedule.py
from datetime import datetime, timezone

from bellwether.results import schedule

SCHED = {"states": [{"state": "OH", "first": 450, "last": 450}, {"state": "TX", "first": 420, "last": 540},
                    {"state": "XX", "first": None, "last": None}]}


def utc(day, h, m=0):
    return datetime(2026, 11, day, h, m, tzinfo=timezone.utc)


def test_closing_times_convert_from_eastern_standard_time():
    assert schedule.last_close_utc("OH", SCHED) == utc(4, 0, 30)     # 7:30 p.m. ET = 450 min after noon = 00:30Z on Nov. 4
    assert schedule.last_close_utc("TX", SCHED) == utc(4, 2, 0)      # 9 p.m. ET: the LAST closing of a multi-timezone state
    assert schedule.first_close_utc(SCHED) == utc(4, 0, 0)           # 7 p.m. ET


def test_polls_closed_waits_for_the_last_closing_and_never_guesses():
    assert not schedule.polls_closed("TX", utc(4, 1, 0), SCHED)       # 8 p.m. ET: the western part is still open
    assert schedule.polls_closed("TX", utc(4, 2, 1), SCHED)
    assert not schedule.polls_closed("XX", utc(5, 12), SCHED) and not schedule.polls_closed("ZZ", utc(5, 12), SCHED)


def test_the_published_schedule_covers_every_state():
    sched = schedule.load()
    assert len(sched["states"]) == 50
    assert sum(1 for s in sched["states"] if s["last"] is not None) >= 45
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_schedule.py`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement**

```python
# pipeline/bellwether/results/schedule.py
"""Poll-closing times for the Nov. 3, 2026 election as UTC instants. A race is never called before its state's last polls close."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCHEDULE = Path(__file__).resolve().parents[3] / "web" / "public" / "data" / "schedule.json"
NOON_ET = datetime(2026, 11, 3, 17, 0, tzinfo=timezone.utc)   # 12:00 ET on Nov. 3; daylight time ended Nov. 1, so ET = UTC-5


def load(path: Path = SCHEDULE) -> dict:
    return json.loads(path.read_text())


def _row(state: str, sched: dict) -> dict | None:
    return next((s for s in sched.get("states", []) if s["state"] == state), None)


def last_close_utc(state: str, sched: dict) -> datetime | None:
    row = _row(state, sched)
    return NOON_ET + timedelta(minutes=row["last"]) if row and row.get("last") is not None else None


def first_close_utc(sched: dict) -> datetime | None:
    firsts = [s["first"] for s in sched.get("states", []) if s.get("first") is not None]
    return NOON_ET + timedelta(minutes=min(firsts)) if firsts else None


def polls_closed(state: str, now: datetime, sched: dict) -> bool:
    t = last_close_utc(state, sched)
    return t is not None and now >= t
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_schedule.py`
Expected: PASS. If the 50-state assertion fails, the missing states are a data problem in `publish.poll_schedule` / `data/config/poll_closing_fallback.json`: list them in your report; do not lower the test below 45.

- [ ] **Step 5: Commit**

```bash
git add pipeline/bellwether/results/schedule.py pipeline/tests/test_schedule.py
git commit -m "Results: poll-closing times as UTC; no call before the last polls close"
```

---

### Task 8: Chamber control from calls, and governor draws in the simulation export

**Files:**
- Create: `pipeline/bellwether/results/chamber.py`, `pipeline/tests/test_chamber.py`
- Modify: `pipeline/bellwether/publish.py` (`export_whatif`), `web/lib/whatif.ts` (type) and any web consumer `tsc` flags
- Test: `pipeline/tests/test_publish.py` (append)

**Interfaces:**
- Produces: `chamber_calls(calls: dict[str, dict], races: list[dict], meta: dict) -> dict` returning `{"senate": {...}, "house": {...}, "governor": {...}}`. Each value is `{"D": int, "R": int, "other": int, "undecided": int}`; Senate and House also carry `"control": "D" | "R" | None` and `"need": {"D": int, "R": int}` (Senate: contested-race seats each party needs in total, after seats not up; House: seats needed). `races` are rows of `races.json`; `meta` is `whatif.json` (`senate_not_up`, `senate_majority`, `house_majority`, `vp`).
- A seat counts for a party only when its race is **called** (state `"called"`) or **settled before the night** (race `kind` is `uncontested` or `same_party`). Withdrawn calls count as undecided.

- [ ] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_chamber.py
from bellwether.results.chamber import chamber_calls

META = {"senate_not_up": {"D": 32, "R": 31, "I_caucus_D": 2}, "senate_majority": 51, "house_majority": 218, "vp": "R"}


def races(n_senate=35, n_house=0):
    out = [{"id": f"2026-sen-S{i}", "office": "senate", "kind": "two_party", "dside": {"party": "D"}, "rside": {"party": "R"}} for i in range(n_senate)]
    out += [{"id": f"2026-house-H{i}", "office": "house", "kind": "two_party", "dside": {"party": "D"}, "rside": {"party": "R"}} for i in range(n_house)]
    return out


def called(winner):
    return {"state": "called", "winner": winner}


def test_senate_control_is_called_only_when_called_seats_guarantee_it():
    rs = races()
    calls = {f"2026-sen-S{i}": called("dside") for i in range(17)}          # 17 + 32 + 2 = 51 Democratic seats
    out = chamber_calls(calls, rs, META)["senate"]
    assert out["D"] == 17 and out["undecided"] == 18 and out["control"] == "D" and out["need"]["D"] == 17
    calls.pop("2026-sen-S0")                                                  # 50 seats: not yet guaranteed with a Republican VP
    assert chamber_calls(calls, rs, META)["senate"]["control"] is None


def test_republican_control_needs_fifty_with_a_republican_vice_president():
    calls = {f"2026-sen-S{i}": called("rside") for i in range(19)}          # 19 + 31 = 50
    out = chamber_calls(calls, races(), META)["senate"]
    assert out["control"] == "R" and out["need"]["R"] == 19


def test_withdrawn_calls_and_unfinished_races_are_undecided_and_settled_races_count():
    rs = races(3) + [{"id": "2026-sen-X", "office": "senate", "kind": "uncontested", "dside": {"party": "D"}, "rside": {"party": None}}]
    calls = {"2026-sen-S0": {"state": "withdrawn", "winner": "dside"}, "2026-sen-S1": called("rside")}
    out = chamber_calls(calls, rs, META)["senate"]
    assert (out["D"], out["R"], out["undecided"]) == (1, 1, 2)


def test_house_and_governor_counts():
    rs = races(0, 4) + [{"id": "2026-gov-G", "office": "governor", "kind": "two_party", "dside": {"party": "I"}, "rside": {"party": "R"}}]
    calls = {"2026-house-H0": called("dside"), "2026-gov-G": called("dside")}
    out = chamber_calls(calls, rs, META)
    assert out["house"]["D"] == 1 and out["house"]["undecided"] == 3 and out["house"]["control"] is None
    assert out["governor"]["other"] == 1
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_chamber.py`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement**

```python
# pipeline/bellwether/results/chamber.py
"""Seat counts and chamber control from calls. Control is stated only when the called (and settled) seats guarantee a majority;
before that the site shows live odds from the forecast simulations (web/lib/live.ts#liveChamber)."""
from __future__ import annotations


def _count(office: str, calls: dict, races: list[dict]) -> dict:
    t = {"D": 0, "R": 0, "other": 0, "undecided": 0}
    for r in races:
        if r["office"] != office:
            continue
        party = None
        if r["kind"] in ("uncontested", "same_party"):
            party = (r.get("dside") or {}).get("party")
        elif r["kind"] == "two_party":
            c = calls.get(r["id"])
            if c and c.get("state") == "called":
                party = ((r.get("dside") if c["winner"] == "dside" else r.get("rside")) or {}).get("party")
        else:
            continue
        if party is None:
            t["undecided"] += 1
        elif party in ("D", "R"):
            t[party] += 1
        else:
            t["other"] += 1
    return t


def chamber_calls(calls: dict, races: list[dict], meta: dict) -> dict:
    out = {o: _count(o, calls, races) for o in ("senate", "house", "governor")}
    nu, maj, vp = meta["senate_not_up"], meta["senate_majority"], meta["vp"]
    d_need, r_need = (maj, maj - 1) if vp == "R" else (maj - 1, maj)
    s = out["senate"]
    d_total, r_total = s["D"] + nu["D"] + nu["I_caucus_D"], s["R"] + nu["R"]
    s["control"] = "D" if d_total >= d_need else "R" if r_total >= r_need else None
    s["need"] = {"D": max(0, d_need - nu["D"] - nu["I_caucus_D"]), "R": max(0, r_need - nu["R"])}
    h, hm = out["house"], meta["house_majority"]
    h["control"] = "D" if h["D"] >= hm else "R" if h["R"] >= hm else None
    h["need"] = {"D": hm, "R": hm}
    return out
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_chamber.py`
Expected: PASS

- [ ] **Step 5: Write the failing governor-export test**

```python
# append to pipeline/tests/test_publish.py
import json
from datetime import date
from types import SimpleNamespace as NS

import numpy as np

from bellwether.publish import export_whatif


def _sim_row(office, rid, st, district=None):     # not `_row`: test_publish.py already has a helper with that name
    race = NS(id=rid, office=office, state=st, state_name=st, district=district, special=False)
    return {"race": race, "pr": NS(d_name="A D", d_party="D", r_name="B R", r_party="R")}


def test_whatif_export_includes_governor_races_for_live_odds(tmp_path):
    rows = [_sim_row("senate", "2026-sen-GA", "GA"), _sim_row("house", "2026-house-GA-01", "GA", 1), _sim_row("governor", "2026-gov-GA", "GA")]
    margins = np.stack([np.full(4000, 3.0), np.full(4000, 40.0), np.full(4000, -2.0)], axis=1).astype(np.float32)
    fc = NS(today=date(2026, 10, 2), last={"rows": rows, "sim_rows": rows, "margins": margins})
    export_whatif(fc, tmp_path)
    meta = json.loads((tmp_path / "whatif.json").read_text())
    by_id = {r["id"]: r for r in meta["races"]}
    assert by_id["2026-gov-GA"]["o"] == "g" and "c" in by_id["2026-gov-GA"]          # governors have draws
    assert "c" not in by_id["2026-house-GA-01"] and by_id["2026-house-GA-01"]["w"] == "D"   # a 40-point House seat is settled
    assert meta["k"] == 2 and (tmp_path / "whatif.bin").stat().st_size == meta["n"] * meta["k"]
```

- [ ] **Step 6: Run to verify failure, then implement**

Run: `python3 -m pytest -q pipeline/tests/test_publish.py -k whatif_export`
Expected: FAIL (`KeyError: '2026-gov-GA'`)

In `pipeline/bellwether/publish.py`, inside `export_whatif`, allow governors and give them the Senate threshold:

```python
        if r.office not in ("senate", "house", "governor"):
            continue
        ...
        if j is not None and abs(med) < (30 if r.office in ("senate", "governor") else 20):
```

(The `entry["o"] = r.office[0]` line already yields `"g"` for governors.) Run the test again. Expected: PASS.

- [ ] **Step 7: Make the web ignore governor entries**

In `web/lib/whatif.ts` change the race office field type to `o: "s" | "h" | "g"`. Run `npx --prefix web tsc --noEmit -p web`; fix each reported error by excluding `"g"` where code iterates all races for the what-if builder (the builder stays Senate and House only). Add one assertion to `web/lib/live.test.ts` that `liveChamber(meta, sims, "s", {}, [])` ignores a `"g"` race present in `meta.races` (build a small meta and Int8Array by hand, following the existing tests in that file).

Run: `npm --prefix web run test:live` and `npx --prefix web tsc --noEmit -p web`
Expected: PASS and no type errors.

- [ ] **Step 8: Commit**

```bash
git add pipeline/bellwether/results/chamber.py pipeline/bellwether/publish.py pipeline/tests/test_chamber.py pipeline/tests/test_publish.py web/lib web/components
git commit -m "Chamber control from calls; governor draws in the simulation export"
```

---

### Task 9: Worker integration, restart persistence, kill switch, coverage

**Files:**
- Create: `pipeline/bellwether/results/context.py`, `pipeline/bellwether/results/persist.py`, `pipeline/tests/test_worker_calls.py`
- Modify: `pipeline/bellwether/results/worker.py`, `pipeline/bellwether/results/run.py`

**Interfaces:**
- Consumes: `sides.load_sides`, `baseline.load`, `schedule.load/polls_closed/first_close_utc`, `calls.decide_call/CallBook/Call`, `chamber.chamber_calls`.
- Produces:
  - `context.Context(sides: dict, baseline: dict, schedule: dict, races: list[dict], meta: dict)` and `context.load_context() -> Context`.
  - `persist.load_prev(out: Path, remote_get=None) -> dict | None` returning `{"results": ..., "status": ...}` from the local `out` directory, else via `remote_get(name: str) -> bytes | None` (`name` is `"results.json"` or `"status.json"`); `None` if either is missing or unreadable.
  - `worker.run_once(readers, prev=None, overrides=None, now=None, ctx=None) -> (results, status)`. With `ctx`, `results` also holds `live: bool`, `calls: dict[str, dict]`, `call_log: list[dict]`, `chambers: dict`, `coverage: {"races_total": int, "races_with_numbers": int, "link_out_states": list[str]}`. Without `ctx`, behaviour is unchanged (existing tests keep passing).
- Rules in `run_once` (with `ctx`):
  - `live` is `overrides.get("live", True)` **and** `now >= first_close_utc`. `live: false` in `live_overrides.json` is the kill switch.
  - Races entered by hand (`by_hand`) are never called automatically.
  - A hold with action `undecided` forces the call to `counting` with no probability (this withdraws an existing call visibly). Holds with action `decided_*` are not accepted: `check_overrides` reports "calls are automatic; use undecided to hold a race open" in `status.override_errors`.
  - `link_out_states`: forecast states with no successful read (no `last_success`, or not in `readers`).

- [ ] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_worker_calls.py
import json
from pathlib import Path

from bellwether.results import persist, worker
from bellwether.results.context import Context
from bellwether.results.model import Cand, RaceResult

RID = "2026-sen-GA"
AFTER = "2026-11-04T02:00:00+00:00"     # 9 p.m. ET: past the 7 p.m. close
BEFORE = "2026-11-03T20:00:00+00:00"


def ctx():
    sides = {RID: {"dname": "Ann Lee", "dparty": "D", "rname": "Bo Ray", "rparty": "R", "rules": {}, "office": "senate", "kind": "two_party", "state": "GA"}}
    sched = {"states": [{"state": "GA", "first": 420, "last": 420}]}
    races = [{"id": RID, "office": "senate", "kind": "two_party", "state": "GA", "dside": {"party": "D"}, "rside": {"party": "R"}},
             {"id": "2026-sen-TX", "office": "senate", "kind": "two_party", "state": "TX", "dside": {"party": "D"}, "rside": {"party": "R"}}]
    meta = {"senate_not_up": {"D": 32, "R": 31, "I_caucus_D": 2}, "senate_majority": 51, "house_majority": 218, "vp": "R"}
    return Context(sides, {}, sched, races, meta)


def feed(d=700_000, r=300_000, units=95):
    return lambda: [RaceResult(RID, "GA", [Cand("Ann Lee", "D", d), Cand("Bo Ray", "R", r)], units, 100, "GA SoS")]


def test_calls_chambers_and_coverage_are_published():
    res, st = worker.run_once({"GA": feed()}, None, {}, now=AFTER, ctx=ctx())
    assert res["live"] is True and res["calls"][RID]["state"] == "called" and res["calls"][RID]["winner"] == "dside"
    assert res["chambers"]["senate"]["D"] == 1 and res["call_log"][0]["event"] == "called"
    assert res["coverage"] == {"races_total": 2, "races_with_numbers": 1, "link_out_states": ["TX"]}


def test_nothing_is_live_or_called_before_the_polls_close():
    res, _ = worker.run_once({"GA": feed()}, None, {}, now=BEFORE, ctx=ctx())
    assert res["live"] is False and res["calls"][RID]["state"] == "waiting"


def test_kill_switch_turns_the_live_view_off():
    res, _ = worker.run_once({"GA": feed()}, None, {"live": False}, now=AFTER, ctx=ctx())
    assert res["live"] is False


def test_a_hold_withdraws_a_call_visibly_and_decided_holds_are_rejected():
    r1, s1 = worker.run_once({"GA": feed()}, None, {}, now=AFTER, ctx=ctx())
    ov = {"holds": [{"race_id": RID, "action": "undecided", "reason": "recount talk"}]}
    r2, _ = worker.run_once({"GA": feed()}, {"results": r1, "status": s1}, ov, now=AFTER, ctx=ctx())
    assert r2["calls"][RID]["state"] == "withdrawn" and "recount talk" in r2["calls"][RID]["reason"]
    bad = {"holds": [{"race_id": RID, "action": "decided_dside", "reason": "x"}]}
    _, s3 = worker.run_once({"GA": feed()}, None, bad, now=AFTER, ctx=ctx())
    assert any("automatic" in e for e in s3["override_errors"])


def test_hand_entered_races_are_not_called_automatically():
    ov = {"results": [{"race_id": RID, "reason": "feed down", "source": "county site",
                       "cands": [{"name": "Ann Lee", "party": "D", "votes": 9}, {"name": "Bo Ray", "party": "R", "votes": 1}]}]}
    res, _ = worker.run_once({"GA": feed()}, None, ov, now=AFTER, ctx=ctx())
    assert res["calls"][RID]["state"] == "counting" and "hand" in res["calls"][RID]["reason"].lower()


def test_a_stale_feed_keeps_its_call_and_the_state_is_marked_stale():
    r1, s1 = worker.run_once({"GA": feed()}, None, {}, now=AFTER, ctx=ctx())

    def down():
        raise RuntimeError("HTTP 503")
    r2, s2 = worker.run_once({"GA": down}, {"results": r1, "status": s1}, {}, now=AFTER, ctx=ctx())
    assert s2["states"]["GA"]["state"] == "stale" and r2["calls"][RID]["state"] == "called"


def test_restart_resumes_from_the_last_published_files(tmp_path: Path):
    r1, s1 = worker.run_once({"GA": feed()}, None, {}, now=AFTER, ctx=ctx())
    worker.write(r1, s1, tmp_path)
    prev = persist.load_prev(tmp_path)
    assert prev["results"]["calls"][RID]["state"] == "called"
    store = {"results.json": json.dumps(r1).encode(), "status.json": json.dumps(s1).encode()}
    prev2 = persist.load_prev(tmp_path / "empty", remote_get=lambda name: store.get(name))
    assert prev2["status"]["states"]["GA"]["state"] == "ok"
    assert persist.load_prev(tmp_path / "empty", remote_get=lambda name: None) is None
    # a restarted worker must still reject votes that go down, and keep the call
    r2, s2 = worker.run_once({"GA": feed(d=100_000, r=50_000, units=10)}, prev2, {}, now=AFTER, ctx=ctx())
    assert s2["states"]["GA"]["rejected"] and r2["calls"][RID]["state"] == "called"
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_worker_calls.py`
Expected: FAIL (`ModuleNotFoundError: bellwether.results.context`)

- [ ] **Step 3: Implement `context.py` and `persist.py`**

```python
# pipeline/bellwether/results/context.py
"""Everything the worker needs besides the feeds themselves."""
from __future__ import annotations

import json
from dataclasses import dataclass

from . import baseline, schedule, sides


@dataclass
class Context:
    sides: dict
    baseline: dict
    schedule: dict
    races: list
    meta: dict


def load_context() -> Context:
    data = sides.RACES_JSON.parent
    return Context(sides.load_sides(), baseline.load(), schedule.load(), json.loads(sides.RACES_JSON.read_text()),
                   json.loads((data / "whatif.json").read_text()))
```

```python
# pipeline/bellwether/results/persist.py
"""Resume after a restart. The election-night workflow chains three jobs; each starts with an empty worker, which would forget the last good
numbers, the 'votes went down' checks and every call. The new job starts from the last published files instead."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Callable


def load_prev(out: Path, remote_get: Callable[[str], bytes | None] | None = None) -> dict | None:
    got = {}
    for name in ("results.json", "status.json"):
        p = Path(out) / name
        raw = p.read_bytes() if p.exists() else (remote_get(name) if remote_get else None)
        if raw is None:
            return None
        try:
            got[name] = json.loads(raw)
        except json.JSONDecodeError:
            return None
    return {"results": got["results.json"], "status": got["status.json"]}
```

- [ ] **Step 4: Extend `worker.run_once` and `check_overrides`**

In `check_overrides`, replace the hold validation so decided holds are rejected:

```python
            if e.get("action") != "undecided":
                raise ValueError("calls are automatic; use undecided to hold a race open")
```

(keep the `reason` check and the error format `holds[{i}] ({race}): {ex}`). Change the signature to `def run_once(readers, prev=None, overrides=None, now=None, ctx=None)`. Move the `check_overrides(overrides or {})` call (the `hand, holds, ov_errors = ...` line) to just after the readers loop, unchanged, and add this immediately after the hand results are merged and **before** `results = {...}` is built; then add `**extra` to the `results` dict:

```python
    extra: dict = {}
    if ctx is not None:
        from datetime import datetime
        from . import schedule
        from .calls import Call, CallBook, decide_call
        from .chamber import chamber_calls
        now_dt = datetime.fromisoformat(now)
        book = CallBook((prev.get("results") or {}).get("calls"), (prev.get("results") or {}).get("call_log"))
        hand_ids = {r.race_id for r in hand}
        calls: dict[str, dict] = {}
        for rid, r in merged.items():
            info = ctx.sides.get(rid)
            if info is None:
                continue
            call = decide_call(r, info, ctx.baseline, schedule.polls_closed(r.state, now_dt, ctx.schedule))
            if rid in hand_ids:
                call = Call(rid, "counting", None, call.leader, None, call.margin, call.sd, call.mode,
                            "Numbers entered by hand: not called automatically")
            elif holds.get(rid, {}).get("action") == "undecided":
                call = Call(rid, "counting", None, call.leader, None, call.margin, call.sd, call.mode,
                            f"Held open by hand: {holds[rid]['reason']}")
            calls[rid] = book.update(call, now)
        first = schedule.first_close_utc(ctx.schedule)
        read_ok = {st for st, s in states.items() if s.get("last_success")}
        forecast_states = {r["state"] for r in ctx.races}
        extra = {"live": bool((overrides or {}).get("live", True)) and first is not None and now_dt >= first,
                 "calls": calls, "call_log": book.log, "chambers": chamber_calls(calls, ctx.races, ctx.meta),
                 "coverage": {"races_total": sum(1 for r in ctx.races if r["kind"] == "two_party"),
                              "races_with_numbers": sum(1 for rid in merged if rid in ctx.sides),
                              "link_out_states": sorted(forecast_states - read_ok)}}
    results = {"updated": now, "races": [merged[k].to_json() for k in sorted(merged)], "holds": holds, **extra}
```

The probability is set to `None` in both overrides on purpose: `CallBook` keeps a call only while the same side leads with `HOLD_P` or better, so a hold must clear it to withdraw the call visibly.

- [ ] **Step 5: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_worker_calls.py pipeline/tests/test_results.py`
Expected: PASS, including all pre-existing worker tests (they pass no `ctx`). If a pre-existing test expects `decided_*` holds to be accepted, update that test to expect the new error message and note it in the commit message.

- [ ] **Step 6: Wire `run.py` to the context, persistence and R2**

In `pipeline/bellwether/results/run.py`: import `context` and `persist`; in `main()`, for `--once` and `--loop`, build `ctx = context.load_context()` and pass `ctx=ctx` to every `worker.run_once` call; replace `prev = None` in the loop with `prev = persist.load_prev(a.out, remote_get=_r2_get if a.upload else None)`; and add these helpers, making `upload()` use `_r2_client()`:

```python
def _r2_client():
    import boto3  # installed by the workflow
    return boto3.client("s3", endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
                        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                        region_name="auto")


def _r2_get(name: str) -> bytes | None:
    try:
        return _r2_client().get_object(Bucket=os.environ["R2_BUCKET"], Key=f"live/{name}")["Body"].read()
    except Exception:  # noqa: BLE001 - no previous file yet (first job) or a storage hiccup: start clean
        return None
```

Run: `python3 -m pytest -q pipeline`, then from `pipeline/`: `python3 -m bellwether.results.run --once --out /tmp/live-check`
Expected: all tests PASS; the `--once` run writes `results.json` with `"live": false`, `"calls": {}` and a `coverage` block listing every forecast state under `link_out_states`.

- [ ] **Step 7: Commit**

```bash
git add pipeline/bellwether/results pipeline/tests/test_worker_calls.py pipeline/tests/test_results.py
git commit -m "Worker: automatic calls, chamber control, coverage, kill switch, restart persistence"
```

---

### Task 10: The race page shows the worker's call (no browser-side calling), renamed "Bellwether call"

**Files:**
- Modify: `web/lib/livefeed.ts`, `web/components/LiveRacePanel.tsx`, `web/package.json` (test script), plus every file `grep` finds below
- Create: `web/lib/livefeed.test.ts`

**Interfaces:**
- Consumes: the worker's `results.json` fields from Task 9 (`calls`, `call_log`, `chambers`, `coverage`, `live`).
- Produces (all in `web/lib/livefeed.ts`): types `CallState`, `LiveCall`, `LiveChamber`, `LiveCallEvent`; `CALL_LABEL: Record<CallState, string>`; `callBadge(call: LiveCall | undefined, dside: {name: string | null}, rside: {name: string | null}): {text: string; state: CallState}`.

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/livefeed.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { callBadge, type LiveCall } from "./livefeed.ts";

const call = (o: Partial<LiveCall>): LiveCall => ({ state: "counting", winner: null, leader: "dside", p_leader: 0.9, margin: 5, sd: 2, mode: "units", reason: "", called_at: null, withdrawn_at: null, ...o });
const d = { name: "Ann Lee Jr." }, r = { name: "Bo Ray" };

test("a called race says Bellwether call with the winner's surname", () => {
  assert.deepEqual(callBadge(call({ state: "called", winner: "dside" }), d, r), { text: "Bellwether call: Lee", state: "called" });
  assert.equal(callBadge(call({ state: "called", winner: "rside" }), d, r).text, "Bellwether call: Ray");
});

test("other states use plain labels, and a missing call reads as no results yet", () => {
  assert.equal(callBadge(call({ state: "close" }), d, r).text, "Too close to call");
  assert.equal(callBadge(call({ state: "withdrawn", winner: "dside" }), d, r).text, "Call withdrawn");
  assert.equal(callBadge(undefined, d, r).text, "No results yet");
});
```

In `web/package.json` extend the script: `"test:live": "node --experimental-strip-types --no-warnings --test lib/live.test.ts lib/demo.test.ts lib/livefeed.test.ts lib/livehome.test.ts"` (`livehome.test.ts` arrives in Task 11; until then create an empty placeholder file only if the runner fails on the missing path, and delete it in Task 11).

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web run test:live`
Expected: FAIL (`callBadge` is not exported)

- [ ] **Step 3: Implement the types and `callBadge`**

In `web/lib/livefeed.ts`, extend `LiveRace` with `coverage?: { counties_read: number; counties_total: number }`, replace `LiveResults`, and add:

```ts
export type CallState = "waiting" | "counting" | "close" | "called" | "runoff" | "rcv" | "primary" | "withdrawn";
export type LiveCall = {
  state: CallState; winner: "dside" | "rside" | null; leader: "dside" | "rside" | null; p_leader: number | null;
  margin: number | null; sd: number | null; mode: "county" | "units" | null; reason: string; called_at: string | null; withdrawn_at: string | null;
};
export type LiveChamber = { D: number; R: number; other: number; undecided: number; control?: "D" | "R" | null; need?: { D: number; R: number } };
export type LiveCallEvent = { at: string; race_id: string; event: "called" | "withdrawn"; winner: "dside" | "rside" | null; reason: string };
export type LiveResults = {
  updated: string; races: LiveRace[]; holds?: Record<string, { action: "undecided"; reason: string }>;
  live?: boolean; calls?: Record<string, LiveCall>; call_log?: LiveCallEvent[];
  chambers?: { senate: LiveChamber; house: LiveChamber; governor: LiveChamber };
  coverage?: { races_total: number; races_with_numbers: number; link_out_states: string[] };
};

export const CALL_LABEL: Record<CallState, string> = {
  waiting: "No results yet", counting: "Counting", close: "Too close to call", called: "Bellwether call",
  runoff: "Runoff if it holds", rcv: "Ranked-choice count later", primary: "All-party primary", withdrawn: "Call withdrawn",
};
const lastWord = (n: string | null | undefined) => (n ?? "").replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, "").trim().split(/\s+/).pop() ?? "";

export function callBadge(call: LiveCall | undefined, dside: { name: string | null }, rside: { name: string | null }): { text: string; state: CallState } {
  if (!call) return { text: CALL_LABEL.waiting, state: "waiting" };
  if (call.state === "called") {
    const who = lastWord(call.winner === "dside" ? dside.name : rside.name);
    return { text: who ? `${CALL_LABEL.called}: ${who}` : CALL_LABEL.called, state: "called" };
  }
  return { text: CALL_LABEL[call.state], state: call.state };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix web run test:live`
Expected: PASS

- [ ] **Step 5: Make `LiveRacePanel` display the worker's call**

In `web/components/LiveRacePanel.tsx`:
1. Replace the imports `import { decide, liveOdds, type Rule } from "@/lib/live";` and `import { sideOf, type LiveRace } from "@/lib/livefeed";` with `import { liveOdds } from "@/lib/live";` and `import { callBadge, sideOf, type LiveRace } from "@/lib/livefeed";`. Delete the `STATE_LABEL` constant, the `const hold = ...` line, the `const rule: Rule = ...` line, the `let dec = decide(...)` line and the `if (hold) dec = ...` line. Add after `const odds = ...`:

```tsx
  const call = results?.calls?.[raceId];
  const badge = callBadge(call, dside, rside);
  const leader = call?.state === "called" ? (call.winner === "dside" ? dside.name : rside.name) : null;
```
and delete the old `const leader = dec.winner ...` line. Remove `rules` from the destructured props (keep it in `Props` so callers do not change).
2. Replace the chip with `<span className={`chip demo-${badge.state === "called" ? "decided" : badge.state}`}>{badge.text}</span>`.
3. Replace the `won` line with `const won = call?.state === "called" && ((call.winner === "dside" && sd === "d") || (call.winner === "rside" && sd === "r"));` and change `aria-label="Decided"` to `aria-label="Bellwether call"`.
4. Replace `<p className="small">{dec.why}.</p>` with `<p className="small">{call?.reason ?? ""}</p>`.
5. Replace the final sentence of the footer (`“Decided” is our own rule, ...`) with `“Bellwether call” is our own automatic call from the votes still to count; it isn’t a projection by any news organization.`
6. Add a counties note under the "precincts reporting" line: `{row.coverage && <> Based on {row.coverage.counties_read} of {row.coverage.counties_total} counties.</>}`.
7. Add an optional prop `link?: { name: string; url: string }` to `Props`. In the `!row` branch, when `link && results?.coverage?.link_out_states.includes(state)`, render `<p>Results at <a href={link.url} target="_blank" rel="noopener noreferrer">{link.name}</a>. We can’t read this state’s feed automatically, so numbers are not shown here.</p>` instead of the generic "No results yet" text.

- [ ] **Step 6: Rename visible "Decided" text everywhere**

Run: `grep -rn "Decided" web/app web/components web/lib docs/correction-guide.md`
Replace only **visible strings** (UI text, docs) with "Bellwether call" or "called"; do not rename the internal `"decided"` state value or CSS class `demo-decided` used by the rehearsal demo (`web/lib/live.ts`, `web/lib/demo.ts`, `web/components/demo/*`). Add a one-line comment at the top of `web/lib/live.ts#decide`: `// Rehearsal demo only. Real calls are made by the worker (pipeline/bellwether/results/calls.py) and read from results.json.`

- [ ] **Step 7: Verify and commit**

Run: `npx --prefix web tsc --noEmit -p web && npm --prefix web run test:live && npm --prefix web run build`
Expected: no type errors, all tests PASS, build succeeds.

```bash
git add web/lib web/components web/package.json docs
git commit -m "Race page displays the worker's Bellwether call; rename Decided in the UI"
```

---

### Task 11: Live home view (automatic switch on election night)

**Files:**
- Create: `web/lib/livehome.ts`, `web/lib/livehome.test.ts`, `web/components/LiveHome.tsx`
- Modify: `web/app/(site)/page.tsx`, `web/package.json` (test script, already extended in Task 10)

**Interfaces:**
- Consumes: `LiveResults`, `LiveCall`, `LiveCallEvent` (Task 10); `useLive()` from `web/components/useLive.ts`; `liveChamber(meta, sims, office, decided, soft)` from `web/lib/live.ts`; `WMeta` from `web/lib/whatif.ts`.
- Produces (`web/lib/livehome.ts`): `HomeRow` type; `racesToWatch(rows, results, version?, houseCount?) -> HomeRow[]`; `recentCalls(results, n?) -> LiveCallEvent[]`; `flipsSoFar(rows, results) -> HomeRow[]`; `closingNext(schedule, now, windowMin?) -> {minutes: number; states: string[]}[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// web/lib/livehome.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { closingNext, flipsSoFar, racesToWatch, recentCalls, type HomeRow } from "./livehome.ts";
import type { LiveCall, LiveResults } from "./livefeed.ts";

const row = (id: string, office: HomeRow["office"], p: number, inc: string | null = "D"): HomeRow => ({
  id, office, state: "GA", title: id, kind: "two_party", incumbent_party: inc,
  dside: { name: "A", party: "D" }, rside: { name: "B", party: "R" }, p: { fundamentals: p },
});
const called = (winner: "dside" | "rside"): LiveCall => ({ state: "called", winner, leader: winner, p_leader: 1, margin: 9, sd: 1, mode: "units", reason: "", called_at: "t", withdrawn_at: null });
const results = (calls: Record<string, LiveCall>, log: LiveResults["call_log"] = []): LiveResults => ({ updated: "t", races: [], live: true, calls, call_log: log });

test("races to watch: uncalled Senate and governor races first by closeness, then the closest House seats", () => {
  const rows = [row("sen-far", "senate", 0.9), row("sen-close", "senate", 0.52), row("sen-done", "senate", 0.5),
                row("h1", "house", 0.5), row("h2", "house", 0.6), row("h3", "house", 0.55)];
  const out = racesToWatch(rows, results({ "sen-done": called("dside") }), "fundamentals", 2).map((r) => r.id);
  assert.deepEqual(out, ["sen-close", "sen-far", "h1", "h3"]);
});

test("flips are called races won by a party other than the incumbent's", () => {
  const rows = [row("a", "senate", 0.5, "D"), row("b", "senate", 0.5, "D"), row("c", "house", 0.5, null)];
  const out = flipsSoFar(rows, results({ a: called("rside"), b: called("dside"), c: called("rside") })).map((r) => r.id);
  assert.deepEqual(out, ["a"]);   // b held; c has no incumbent to flip from
});

test("recent calls are newest first and capped", () => {
  const log = [1, 2, 3].map((i) => ({ at: `t${i}`, race_id: `r${i}`, event: "called" as const, winner: "dside" as const, reason: "" }));
  assert.deepEqual(recentCalls(results({}, log), 2).map((e) => e.race_id), ["r3", "r2"]);
});

test("closing next lists states closing within the window, soonest first", () => {
  const sched = { states: [{ state: "IN", first: 360, last: 420 }, { state: "OH", first: 450, last: 450 }, { state: "TX", first: 420, last: 540 }] };
  const now = new Date("2026-11-04T00:00:00Z");   // 7:00 p.m. ET = 420 minutes after noon
  assert.deepEqual(closingNext(sched, now, 90), [{ minutes: 30, states: ["OH"] }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix web run test:live`
Expected: FAIL (cannot find `./livehome.ts`)

- [ ] **Step 3: Implement the selectors**

```ts
// web/lib/livehome.ts
/** Pure selectors for the election-night home view. No React, no fetching, so they are testable and reusable. */
import type { LiveCall, LiveCallEvent, LiveResults } from "./livefeed.ts";

export type HomeRow = {
  id: string; office: "senate" | "house" | "governor"; state: string; title: string; kind: string; incumbent_party: string | null;
  dside: { name: string | null; party: string | null }; rside: { name: string | null; party: string | null }; p: Record<string, number>;
};
const isCalled = (c?: LiveCall) => c?.state === "called";
const closeness = (r: HomeRow, v: string) => Math.abs((r.p[v] ?? 0.5) - 0.5);

export function racesToWatch(rows: HomeRow[], results: LiveResults, version = "fundamentals", houseCount = 12): HomeRow[] {
  const calls = results.calls ?? {};
  const open = rows.filter((r) => r.kind === "two_party" && !isCalled(calls[r.id]));
  const top = open.filter((r) => r.office !== "house").sort((a, b) => closeness(a, version) - closeness(b, version));
  const house = open.filter((r) => r.office === "house").sort((a, b) => closeness(a, version) - closeness(b, version)).slice(0, houseCount);
  return [...top, ...house];
}

export function recentCalls(results: LiveResults, n = 8): LiveCallEvent[] {
  return [...(results.call_log ?? [])].reverse().slice(0, n);
}

export function flipsSoFar(rows: HomeRow[], results: LiveResults): HomeRow[] {
  const calls = results.calls ?? {};
  return rows.filter((r) => {
    const c = calls[r.id];
    if (!isCalled(c) || !r.incumbent_party) return false;
    return (c!.winner === "dside" ? r.dside : r.rside).party !== r.incumbent_party;
  });
}

const NOON_ET_UTC = Date.UTC(2026, 10, 3, 17, 0);   // 12:00 ET on Nov. 3 (UTC-5)
export function closingNext(schedule: { states: { state: string; first: number | null; last: number | null }[] }, now: Date, windowMin = 90) {
  const t = (now.getTime() - NOON_ET_UTC) / 60000;   // minutes after noon ET
  const groups = new Map<number, string[]>();
  for (const s of schedule.states) {
    if (s.last == null || s.last <= t || s.last > t + windowMin) continue;
    groups.set(s.last, [...(groups.get(s.last) ?? []), s.state]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([m, states]) => ({ minutes: m - t, states: states.sort() }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm --prefix web run test:live`
Expected: PASS (delete any placeholder `livehome.test.ts` you created in Task 10 first).

- [ ] **Step 5: Build the component**

Find how `web/components/WhatIf.tsx` fetches `whatif.json` / `whatif.bin` and reuse the same paths in `useSims`. Then:

```tsx
// web/components/LiveHome.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { in100 } from "@/lib/format";
import { liveChamber } from "@/lib/live";
import { closingNext, flipsSoFar, racesToWatch, recentCalls, type HomeRow } from "@/lib/livehome";
import type { WMeta } from "@/lib/whatif";
import { useLive } from "./useLive";

const PARTY = { D: "Democratic Party", R: "Republican Party" } as const;
type Sched = { states: { state: string; first: number | null; last: number | null }[] };

function useSims(on: boolean) {
  const [s, set] = useState<{ meta: WMeta; sims: Int8Array } | null>(null);
  useEffect(() => {
    if (!on || s) return;
    let alive = true;
    Promise.all([fetch("/data/whatif.json").then((r) => r.json()), fetch("/data/whatif.bin").then((r) => r.arrayBuffer())])
      .then(([meta, buf]) => { if (alive) set({ meta, sims: new Int8Array(buf) }); }).catch(() => {});
    return () => { alive = false; };
  }, [on, s]);
  return s;
}

/** Appears above the forecast once the worker says the night has started (results.live). Nothing here decides anything:
 * calls, seat counts and control come from the worker; live odds come from the forecast simulations conditioned on them. */
export default function LiveHome({ rows, schedule }: { rows: HomeRow[]; schedule: Sched }) {
  const { results, on } = useLive();
  const sims = useSims(!!results?.live);
  if (!on || !results?.live || !results.chambers) return null;
  const calls = results.calls ?? {};
  const decided: Record<string, "dside" | "rside"> = {};
  const soft: { id: string; margin: number; sd: number }[] = [];
  for (const [id, c] of Object.entries(calls)) {
    if (c.state === "called" && c.winner) decided[id] = c.winner;
    else if (c.margin != null && c.sd != null) soft.push({ id, margin: c.margin, sd: c.sd });
  }
  const odds = (office: "s" | "h") => (sims ? liveChamber(sims.meta, sims.sims, office, decided, soft) : null);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const watch = racesToWatch(rows, results).slice(0, 24);
  const flips = flipsSoFar(rows, results);
  const next = closingNext(schedule, new Date());
  const cov = results.coverage;
  const block = (name: string, office: "s" | "h", ch: NonNullable<typeof results.chambers>["senate"], total: number) => {
    const o = odds(office);
    const pct = (n: number) => `${(n / total) * 100}%`;
    return (
      <div className="live-chamber">
        <h3>{name}</h3>
        {ch.control && <p className="takeaway" role="status"><strong>{name} control called: {PARTY[ch.control]}.</strong></p>}
        <div className="seatbar" role="img" aria-label={`${ch.D} Democratic, ${ch.R} Republican, ${ch.other} other, ${ch.undecided} not yet called`}
             style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: "var(--surface-2, #ddd)" }}>
          <span style={{ width: pct(ch.D), background: "var(--dem)" }} /><span style={{ width: pct(ch.other), background: "var(--ind, #888)" }} /><span style={{ width: pct(ch.R), background: "var(--rep)" }} />
        </div>
        <p className="small">Called so far: <strong className="num">{ch.D}</strong> Democratic, <strong className="num">{ch.R}</strong> Republican{ch.other ? <>, <strong className="num">{ch.other}</strong> other</> : null}; {ch.undecided} not yet called.</p>
        {!ch.control && o && Number.isFinite(o.D) && <p className="small">Chance of control: <strong className="num">{in100(o.D)} in 100</strong> Democratic, <strong className="num">{in100(o.R)} in 100</strong> Republican{o.C > 0.005 ? <>, {in100(o.C)} in 100 neither</> : null}.</p>}
      </div>
    );
  };
  return (
    <section className="block live-home" aria-labelledby="live-home-h">
      <h2 id="live-home-h" className="display">Live results</h2>
      <p className="small muted">Updated automatically. “Bellwether call” is our own automatic call from the votes still to count; it isn’t a projection by any news organization. {cov ? `${cov.races_with_numbers} of ${cov.races_total} races have live numbers; the rest link to the state’s own results site.` : ""}</p>
      <div className="grid-2">{block("Senate", "s", results.chambers.senate, 35)}{block("House", "h", results.chambers.house, 435)}</div>
      {next.length > 0 && <p className="small">Polls closing next: {next.map((g) => `${g.states.join(", ")} in ${Math.round(g.minutes)} min`).join(" · ")}.</p>}
      <h3>Latest calls</h3>
      <ul className="calls-feed">
        {recentCalls(results).map((e) => {
          const r = byId[e.race_id];
          return <li key={`${e.race_id}-${e.at}`}><Link href={`/race/${e.race_id}/`}>{r?.title ?? e.race_id}</Link>: {e.event === "called" ? <>Bellwether call, {e.winner === "dside" ? r?.dside.name : r?.rside.name}.</> : <>call withdrawn.</>} <span className="muted">{e.reason}</span></li>;
        })}
        {!recentCalls(results).length && <li className="muted">No races called yet.</li>}
      </ul>
      {flips.length > 0 && <><h3>Flips so far</h3><ul>{flips.map((r) => <li key={r.id}><Link href={`/race/${r.id}/`}>{r.title}</Link></li>)}</ul></>}
      <h3>Races to watch</h3>
      <ul className="watch-list">{watch.map((r) => <li key={r.id}><Link href={`/race/${r.id}/`}>{r.title}</Link> <span className="muted small">{calls[r.id]?.reason ?? "Waiting for results"}</span></li>)}</ul>
    </section>
  );
}
```

Mount it above the dashboard in `web/app/(site)/page.tsx`:

```tsx
import LiveHome from "@/components/LiveHome";
// ... inside Home(), wrap the existing return:
return (<>
  <LiveHome rows={races as never} schedule={getSchedule()} />
  <Dashboard ... />
</>);
```
Use the same loader `web/app/(site)/schedule/page.tsx` uses for `schedule.json` (search for it in `web/lib/data.ts`; if no getter exists, add `getSchedule()` next to the other getters, reading `public/data/schedule.json`). `races` rows already have the `HomeRow` fields; narrow with a mapper instead of `as never` if `tsc` complains.

- [ ] **Step 6: Verify against a rehearsal feed and commit**

Run: `npx --prefix web tsc --noEmit -p web && npm --prefix web run test:live && npm --prefix web run build`
Expected: no type errors; tests PASS; build succeeds.

Manual check (record the result in the PR description): serve a rehearsal `results.json` (Task 18 produces one) from a local static server, build with `NEXT_PUBLIC_LIVE_URL` pointing at it, open `/`: the live block appears above the forecast with seat bars, calls and "Polls closing next"; set `"live": false` in the file and confirm the block disappears within 15 seconds (kill switch).

```bash
git add web/lib/livehome.ts web/lib/livehome.test.ts web/components/LiveHome.tsx "web/app/(site)/page.tsx" web/lib/data.ts
git commit -m "Live home view: chamber control, calls feed, races to watch, flips, closing next"
```

---

### Task 12: Alerts from inside the worker loop, and unattended auto-start

**Files:**
- Create: `pipeline/bellwether/results/alerts.py`, `pipeline/tools/already_running.py`, `pipeline/tests/test_alerts.py`
- Modify: `pipeline/bellwether/results/run.py`, `.github/workflows/election-night.yml`

**Interfaces:**
- Produces: `alerts.Alerter(open_issue=None)` with `upload_result(ok: bool) -> None` and `check_status(status: dict, key_states: set[str], now: float) -> None` (an issue is opened once per cause); `already_running.is_fresh(updated_iso: str, now: datetime, max_age_s: int = 180) -> bool`.

Why: an hourly cron cannot see a results file that is 3 minutes old, and GitHub skips and delays scheduled runs. The worker is the only thing that knows right now.

- [ ] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_alerts.py
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from already_running import is_fresh  # noqa: E402
from bellwether.results.alerts import Alerter  # noqa: E402


def test_three_failed_uploads_open_one_issue():
    seen = []
    a = Alerter(open_issue=lambda title, body: seen.append(title))
    for ok in (False, False, True, False, False, False, False):
        a.upload_result(ok)
    assert seen == ["Election-night results are not reaching storage"]    # the success reset the count; only one issue despite 4 more failures


def test_a_key_state_stale_for_ten_minutes_opens_an_issue_and_others_do_not():
    seen = []
    a = Alerter(open_issue=lambda title, body: seen.append(title))
    stale = {"states": {"GA": {"state": "stale"}, "OH": {"state": "stale"}, "WY": {"state": "down"}}}
    a.check_status(stale, {"GA", "WY"}, now=1000.0)
    a.check_status(stale, {"GA", "WY"}, now=1000.0 + 599)
    assert seen == []
    a.check_status(stale, {"GA", "WY"}, now=1000.0 + 601)
    assert sorted(seen) == ["Election-night feed is stale: GA", "Election-night feed is stale: WY"]


def test_recovery_resets_the_clock():
    seen = []
    a = Alerter(open_issue=lambda title, body: seen.append(title))
    a.check_status({"states": {"GA": {"state": "stale"}}}, {"GA"}, now=0.0)
    a.check_status({"states": {"GA": {"state": "ok"}}}, {"GA"}, now=500.0)
    a.check_status({"states": {"GA": {"state": "stale"}}}, {"GA"}, now=700.0)
    a.check_status({"states": {"GA": {"state": "stale"}}}, {"GA"}, now=1200.0)
    assert seen == []


def test_guard_skips_a_start_when_another_run_is_already_updating_results():
    now = datetime(2026, 11, 3, 22, 0, tzinfo=timezone.utc)
    assert is_fresh((now - timedelta(seconds=60)).isoformat(), now) is True
    assert is_fresh((now - timedelta(minutes=30)).isoformat(), now) is False
    assert is_fresh("not a date", now) is False
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_alerts.py`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement**

```python
# pipeline/bellwether/results/alerts.py
"""Alerts raised by the worker itself (it is the only thing that knows right now). Each cause opens one GitHub issue, which GitHub emails
to the repo owner. Needs `issues: write` and GH_TOKEN in the workflow; without them the call quietly does nothing."""
from __future__ import annotations

import subprocess

STALE_AFTER_S = 600
UPLOAD_FAILS = 3


def _gh_issue(title: str, body: str) -> None:
    subprocess.run(["gh", "issue", "create", "--title", title, "--body", body], check=False, capture_output=True)


class Alerter:
    def __init__(self, open_issue=None):
        self.open_issue = open_issue or _gh_issue
        self.upload_failures = 0
        self.raised: set[str] = set()
        self.stale_since: dict[str, float] = {}

    def _raise(self, key: str, title: str, body: str) -> None:
        if key not in self.raised:
            self.raised.add(key)
            self.open_issue(title, body)

    def upload_result(self, ok: bool) -> None:
        self.upload_failures = 0 if ok else self.upload_failures + 1
        if self.upload_failures >= UPLOAD_FAILS:
            self._raise("upload", "Election-night results are not reaching storage",
                        f"The worker failed to upload {self.upload_failures} times in a row. The site is showing old numbers. "
                        "Check the R2 secrets and the running election-night job.")

    def check_status(self, status: dict, key_states: set[str], now: float) -> None:
        for st in key_states:
            s = (status.get("states") or {}).get(st)
            if s and s.get("state") in ("stale", "down"):
                since = self.stale_since.setdefault(st, now)
                if now - since >= STALE_AFTER_S:
                    self._raise(f"state-{st}", f"Election-night feed is stale: {st}",
                                f"{st}'s results feed has not updated for {int((now - since) // 60)} minutes. The site shows the last good numbers "
                                f"and a delayed notice. See docs/election-night-runbook.md.")
            else:
                self.stale_since.pop(st, None)
```

```python
# pipeline/tools/already_running.py
"""Guard for the election-night auto-start: if results.json was updated in the last few minutes, another run is live, so this one stands down.

  python pipeline/tools/already_running.py     # reads LIVE_URL; writes skip=true|false to $GITHUB_OUTPUT"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone


def is_fresh(updated_iso: str, now: datetime, max_age_s: int = 180) -> bool:
    try:
        t = datetime.fromisoformat(updated_iso)
    except (TypeError, ValueError):
        return False
    return (now - t).total_seconds() <= max_age_s


def main() -> int:
    url = os.environ.get("LIVE_URL", "").rstrip("/")
    skip = False
    if url:
        try:
            with urllib.request.urlopen(f"{url}/results.json", timeout=15) as r:
                skip = is_fresh(json.load(r)["updated"], datetime.now(timezone.utc))
        except Exception as ex:  # noqa: BLE001 - no file yet, or storage unreachable: start
            print("guard: could not read results.json:", ex)
    print("skip=" + str(skip).lower())
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"skip={str(skip).lower()}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_alerts.py`
Expected: PASS

- [ ] **Step 5: Wire the alerter into the loop**

In `run.py`'s `--loop` branch: create `alerter = alerts.Alerter()` and `key_states = {r["state"] for r in ctx.races if r["office"] in ("senate", "governor")}`; wrap the upload so it sets `ok = True/False` and calls `alerter.upload_result(ok)`; after each `run_once` call `alerter.check_status(st, key_states, time.time())`. Do not alert in `--rehearse` or `--once`.

- [ ] **Step 6: Workflow: permissions, token, auto-start, no duplicate chains**

In `.github/workflows/election-night.yml`:
- Change `permissions:` to `contents: read` and `issues: write`.
- Add schedule triggers (three slots, 4:00, 4:10 and 4:20 p.m. ET on Nov. 3, before the first 6 p.m. close):

```yaml
on:
  schedule:
    - cron: "0 21 3 11 *"
    - cron: "10 21 3 11 *"
    - cron: "20 21 3 11 *"
  workflow_dispatch:
    inputs:
      rehearsal: { description: "Rehearsal: replay old 2024 files instead of reading live feeds", type: boolean, default: false }
```
- In `part1`, add a first step after checkout, an `outputs` entry, and make every later step conditional on it:

```yaml
  part1:
    outputs:
      skip: ${{ steps.guard.outputs.skip }}
    steps:
      - uses: actions/checkout@v4
      - id: guard
        env: { LIVE_URL: "${{ vars.LIVE_URL }}" }
        run: python3 pipeline/tools/already_running.py
      - if: steps.guard.outputs.skip != 'true'
        uses: actions/setup-python@v5
        with: { python-version: "3.11", cache: pip, cache-dependency-path: pipeline/requirements.txt }
      # ... every following step gets: if: steps.guard.outputs.skip != 'true'
```
- `part2` and `part3` `if:` become `${{ always() && inputs.rehearsal != true && needs.part1.outputs.skip != 'true' }}` (part3 also lists `needs: [part1, part2]`).
- Add `GH_TOKEN: ${{ github.token }}` and `LIVE_URL: ${{ vars.LIVE_URL }}` to each Worker step's `env:`.
- Add the repository variable `LIVE_URL` (the R2 public address plus `/live`) to the checklist in `docs/live-storage-setup.md`.

Run: `ruby -ryaml -e 'YAML.load_file(".github/workflows/election-night.yml"); puts "ok"'` and, if available, `actionlint`.
Expected: `ok`. (`secrets.*` must not appear in any step `if:`.)

- [ ] **Step 7: Commit**

```bash
git add pipeline/bellwether/results/alerts.py pipeline/bellwether/results/run.py pipeline/tools/already_running.py pipeline/tests/test_alerts.py .github/workflows/election-night.yml docs/live-storage-setup.md
git commit -m "Worker-side alerts, unattended auto-start with duplicate guard"
```

---

### Task 13: Link-outs for every state, and a readiness table on `/status`

**Files:**
- Create: `data/config/results_links.json`, `pipeline/bellwether/results/readiness.py`, `pipeline/tests/test_links.py`, `pipeline/tests/test_readiness.py`, `web/lib/resultslinks.ts`
- Modify: `pipeline/tools/probe_results_sites.py`, `.github/workflows/results-probe.yml`, `web/app/(site)/status/page.tsx`, `web/app/(site)/race/[id]/page.tsx`, `web/app/(site)/state/[st]/page.tsx`

**Interfaces:**
- Produces: `results_links.json` shaped `{"AL": {"name": "Alabama Secretary of State", "url": "https://..."}, ...}` for all 50 states; `readiness.build(probe: dict, sources: dict, links: dict) -> dict` returning `{"updated": str, "states": {ST: {"probe": "ok"|"blocked"|"error"|"unknown", "reader": str | None, "election_set": bool, "mode": "auto"|"link"}}}`; `web/lib/resultslinks.ts#getResultsLink(state: string): {name: string; url: string} | null`.

- [ ] **Step 1: Write the failing link test**

```python
# pipeline/tests/test_links.py
import json
from pathlib import Path

from bellwether.states import NAMES

LINKS = json.loads((Path(__file__).resolve().parents[2] / "data" / "config" / "results_links.json").read_text())


def test_every_state_has_an_official_https_results_link():
    assert set(NAMES) == set(LINKS)
    for st, v in LINKS.items():
        assert v["url"].startswith("https://") and v["name"].strip(), st
```

Run: `python3 -m pytest -q pipeline/tests/test_links.py`
Expected: FAIL (file missing)

- [ ] **Step 2: Build `results_links.json` from the research doc**

For each of the 50 states, take the official election-night results page from the table at the end of `docs/results-sources.md` (the statewide results page; if a state only has a Secretary of State elections page, use that). Write the file by hand or with a one-off script; **every URL must come from that doc or be opened and confirmed**, not guessed. Where the doc lists a state under "no statewide feed" (WI, MI, NH), use the state elections agency page that links to the county sites. Run the test; Expected: PASS.

- [ ] **Step 3: Write the failing readiness test**

First read `docs/results-probe-latest.json` and `pipeline/tools/probe_results_sites.py` to see the real probe shape, then save a trimmed real excerpt (3-4 states) as `pipeline/tests/fixtures/results/probe_sample.json`. Write the test against that fixture:

```python
# pipeline/tests/test_readiness.py
import json
from pathlib import Path

from bellwether.results import readiness

FX = Path(__file__).parent / "fixtures" / "results"


def test_readiness_marks_each_state_auto_or_link():
    probe = json.loads((FX / "probe_sample.json").read_text())
    sources = {"states": {"GA": {"reader": "enhanced_voting", "election": "2026NovGen"}, "CO": {"reader": "clarity", "election": None}}}
    links = {"GA": {"name": "Georgia SoS", "url": "https://x"}, "CO": {"name": "Colorado SoS", "url": "https://y"}, "ZZ": {"name": "n", "url": "https://z"}}
    out = readiness.build(probe, sources, links)
    assert out["states"]["GA"]["mode"] == "auto" and out["states"]["GA"]["election_set"] is True
    assert out["states"]["CO"]["mode"] == "link" and out["states"]["CO"]["election_set"] is False   # reader exists but the 2026 id is not set yet
    assert out["states"]["ZZ"]["mode"] == "link" and out["states"]["ZZ"]["reader"] is None
```

Run: `python3 -m pytest -q pipeline/tests/test_readiness.py`; Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 4: Implement `readiness.build` and the probe output**

```python
# pipeline/bellwether/results/readiness.py
"""Which states will have automatic numbers on the night, and which will link out. Combines the daily probe (does the state's site answer us?)
with live_sources.json (is a reader configured and the 2026 election id filled in?)."""
from __future__ import annotations

from datetime import datetime, timezone


def _probe_state(probe: dict, st: str) -> str:
    row = (probe.get("states") or probe).get(st) if isinstance(probe, dict) else None
    if not row:
        return "unknown"
    status = row.get("status") if isinstance(row, dict) else row
    return "ok" if status in ("ok", 200, "200") else "blocked" if status in ("blocked", 403, "403") else "error"


def build(probe: dict, sources: dict, links: dict) -> dict:
    out = {}
    for st in sorted(set(links) | set(sources.get("states", {}))):
        cfg = sources.get("states", {}).get(st) or {}
        has_reader = bool(cfg.get("reader"))
        election_set = bool(cfg.get("election"))
        p = _probe_state(probe, st)
        out[st] = {"probe": p, "reader": cfg.get("reader") if has_reader else None, "election_set": election_set,
                   "mode": "auto" if has_reader and election_set and p != "blocked" else "link"}
    return {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "states": out}
```

**Adapt `_probe_state` to the real probe fixture's field names from Step 3** (the structure above is a placeholder only for the function's *shape*; the test fixture is authoritative). In `probe_results_sites.py` add a `--write-web` option that also writes `web/public/data/readiness.json` using `readiness.build(...)`; in `.github/workflows/results-probe.yml` run it with that flag and `git add docs/results-probe-latest.json web/public/data/readiness.json`.

Run: `python3 -m pytest -q pipeline/tests/test_readiness.py`; Expected: PASS.

- [ ] **Step 5: Web: link-out and readiness table**

```ts
// web/lib/resultslinks.ts
import fs from "node:fs";
import path from "node:path";

type Link = { name: string; url: string };
let cache: Record<string, Link> | null = null;
export function getResultsLink(state: string): Link | null {
  cache ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data", "config", "results_links.json"), "utf8"));
  return cache![state] ?? null;
}
```

Pass `link={getResultsLink(r.state) ?? undefined}` into `LiveRacePanel` in `web/app/(site)/race/[id]/page.tsx`. Create a small client component `web/components/StateLive.tsx` that, on a state page, shows each race's call badge from `useLive()` (reuse `callBadge`) and the "Results at ..." link for states in `coverage.link_out_states`; mount it in `web/app/(site)/state/[st]/page.tsx`. In `web/app/(site)/status/page.tsx` add an "Election-night readiness" section: a table of the 50 states from `readiness.json` with columns State, Mode (Automatic / Link to the state's site), Reader, 2026 election set, Site answers us (yes / blocked / unknown). Keep the page static; if `readiness.json` is missing, omit the section.

Run: `npx --prefix web tsc --noEmit -p web && npm --prefix web run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add data/config/results_links.json pipeline web .github/workflows/results-probe.yml
git commit -m "Official results link for every state; readiness table on /status"
```

---

### Task 14: Clarity county detail, then SC / KY / AR / NJ  (**BLOCKED until a real county-detail file is committed**)

**Files:**
- Create: `pipeline/tests/fixtures/results/<real file(s) listed in Step 1>`
- Modify: `pipeline/bellwether/results/clarity.py`, `pipeline/tests/test_results.py`, `data/config/live_sources.json`, `docs/reader-status.md`

**Interfaces:**
- Produces: `clarity.parse_detail(content: bytes, state: str, year: int = 2026, url: str = "") -> list[RaceResult]` returning statewide races with `counties` filled (`county name -> [Democratic, Republican, other]`) and `units_*` from the same file; `clarity.fetch` uses it when the detail file exists and falls back to `summary.csv` otherwise.

Rule for this task and Tasks 15-16: **never write a parser for a format you have not opened.** The only existing Clarity fixture is `co_2024_summary.csv`, which has no county detail.

- [ ] **Step 1: Get real files (blocking step)**

For Colorado 2024 (election id `122598`, `https://results.enr.clarityelections.com/CO/122598/`): read `current_ver.txt`, then download `<version>/reports/detailxml.zip` (and, if the site offers it, the county-level CSV/JSON report) with `curl -A "$BELLWETHER_USER_AGENT"`. Open the file and write down its structure (contest, choice, vote types, county elements) in `docs/reader-status.md`. Commit it as `pipeline/tests/fixtures/results/co_2024_detailxml.zip`. For SC, KY, AR and NJ, do the same with their most recent general election; if a state's site refuses the request (the daily probe already shows KY and AR returning errors), **stop for that state, record the status code in `docs/reader-status.md`, and leave it a link-out state.** Do not work around a block.

- [ ] **Step 2: Write the failing test from the real file**

Template (fill the expected numbers from the committed file, by summing two or three counties by hand):

```python
def test_clarity_county_detail_2024():
    content = (FX / "co_2024_detailxml.zip").read_bytes()
    rows = {r.race_id: r for r in clarity.parse_detail(content, "CO", 2024)}
    r = rows["2024-house-CO-05"]                      # use a contest present in the file
    assert r.counties and sum(v[0] + v[1] + v[2] for v in r.counties.values()) == r.total
    assert r.counties["El Paso"][1] > 0               # replace with a real county and a number you checked by hand
```

Run: `python3 -m pytest -q pipeline/tests/test_results.py -k clarity_county`; Expected: FAIL (`parse_detail` missing).

- [ ] **Step 3: Implement `parse_detail` against the structure you documented**

Reuse `contests.classify`, `contests.ticket_name`, `model.party_side` exactly as `clarity.parse` does. County names go through unchanged (the engine normalises them). Statewide races only get `counties`.

- [ ] **Step 4: Run, fill `live_sources.json`, commit**

Run: `python3 -m pytest -q pipeline`
Expected: PASS. Then set the `clarity` entries' notes in `data/config/live_sources.json` and the status table in `docs/reader-status.md` (Tested / Same platform / Blocked). Leave `election` as `null` until the state publishes its 2026 id.

```bash
git add pipeline data/config/live_sources.json docs/reader-status.md
git commit -m "Clarity: county detail for statewide races (tested on real CO 2024 file)"
```

---

### Task 15: Enhanced Voting for UT / WA / ID  (**BLOCKED until real files for each state are committed**)

**Files:** Create fixtures `pipeline/tests/fixtures/results/{ut,wa,id}_<year>_ballot-items.json`; modify `pipeline/bellwether/results/enhanced_voting.py` (`SITES`), `pipeline/tests/test_results.py`, `docs/reader-status.md`, `data/config/live_sources.json`.

**Interfaces:** unchanged (`enhanced_voting.fetch(state, election, year)` and `parse(data, state, year, url)`); this task only adds states to `SITES` and county detail if the feed has it.

- [ ] **Step 1 (blocking):** Find each state's Enhanced Voting results address and a past election id **by opening the state's official results page in a browser and reading the network requests**, or from the state's own documentation. Download one real `ballot-items` JSON per state and commit it. If a state's site is not an Enhanced Voting site after all, record that in `docs/reader-status.md` and stop for that state.
- [ ] **Step 2:** For each state, write a test like `test_georgia_2024` in `test_results.py` against its fixture (race count, a candidate's party, a vote total checked by hand).
- [ ] **Step 3:** Add the confirmed base address to `SITES`; run `python3 -m pytest -q pipeline`; Expected PASS.
- [ ] **Step 4:** If the feed includes county rows, fill `RaceResult.counties` for statewide races and add an assertion that county sums equal the race total.
- [ ] **Step 5: Commit** `git add pipeline docs data/config && git commit -m "Enhanced Voting: UT, WA, ID readers tested on real files"`

---

### Task 16: ElectionStats for MA / VT / CT / NM  (**BLOCKED until a real export is committed**)

**Files:** Create `pipeline/bellwether/results/electionstats.py`, `pipeline/tests/fixtures/results/<state>_electionstats_*`; modify `pipeline/bellwether/results/run.py` (register `kind == "electionstats"`), tests, docs.

**Interfaces:** `electionstats.parse(content: bytes, state: str, year: int = 2026, url: str = "") -> list[RaceResult]` and `electionstats.fetch(state: str, election_id: str, year: int = 2026) -> list[RaceResult]`, same shapes as `clarity`.

- [ ] **Step 1 (blocking):** Open each state's ElectionStats site (the addresses are in `docs/results-sources.md`), find the machine-readable export the site itself offers (CSV/JSON "download" or the JSON the page requests), save a real past-election example per state into the fixtures folder, and record the field names in `docs/reader-status.md`. If a state exposes no export, record it and leave that state link-out.
- [ ] **Step 2:** Write the failing test from the real file (race id, top two candidates' votes checked by hand, county or town rows summing to the total where present).
- [ ] **Step 3:** Implement `parse` against the documented fields, reusing `contests.classify`, `ticket_name`, `party_side`; New England states report by town, so build `units_reporting/units_total` from towns and leave `counties` empty unless towns can be mapped to counties from the file itself.
- [ ] **Step 4:** Register in `run.py#readers_from_config`, run `python3 -m pytest -q pipeline`; Expected PASS.
- [ ] **Step 5: Commit** `git add pipeline docs && git commit -m "ElectionStats reader (tested on real exports)"`

---

### Task 17: County aggregation and key-state readers

**Files:**
- Create: `pipeline/bellwether/results/county_agg.py`, `pipeline/tests/test_county_agg.py`
- Modify: `pipeline/bellwether/results/model.py`, `pipeline/bellwether/results/run.py`, `web/lib/livefeed.ts` (already has `coverage?` from Task 10)

**Interfaces:**
- Produces: `RaceResult.coverage: Optional[dict[str, int]]` (`{"counties_read": n, "counties_total": m}`); `county_agg.combine(state: str, race_id: str, per_county: dict[str, RaceResult], counties_total: int, source: str, source_url: str = "") -> RaceResult | None`.
- Behaviour: sums candidates by `(name, party)` across the county results; fills `counties` (county -> `[D, R, other]`), `units_reporting` = counties with any votes, `units_total` = `counties_total`, and `coverage`. Returns `None` if no county has votes.

- [ ] **Step 1: Write the failing tests**

```python
# pipeline/tests/test_county_agg.py
from bellwether.results.county_agg import combine
from bellwether.results.model import Cand, RaceResult


def county(rid, d, r, o=0):
    cands = [Cand("Ann Lee", "D", d), Cand("Bo Ray", "R", r)] + ([Cand("Cy Fox", "O", o)] if o else [])
    return RaceResult(rid, "WI", cands, 1, 1, "county site")


def test_combine_sums_candidates_and_records_coverage():
    per = {"Dane": county("2026-gov-WI", 300, 100, 5), "Waukesha": county("2026-gov-WI", 100, 250), "Iron": county("2026-gov-WI", 0, 0)}
    out = combine("WI", "2026-gov-WI", per, counties_total=72, source="WI county clerks")
    by = {c.name: c.votes for c in out.cands}
    assert by == {"Ann Lee": 400, "Bo Ray": 350, "Cy Fox": 5}
    assert out.counties == {"Dane": [300, 100, 5], "Waukesha": [100, 250, 0]}      # a county with no votes yet is not listed
    assert out.units_reporting == 2 and out.units_total == 72 and out.coverage == {"counties_read": 2, "counties_total": 72}


def test_no_votes_anywhere_returns_none():
    assert combine("WI", "2026-gov-WI", {"Iron": county("2026-gov-WI", 0, 0)}, 72, "x") is None
    assert combine("WI", "2026-gov-WI", {}, 72, "x") is None
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_county_agg.py`
Expected: FAIL (`ModuleNotFoundError`)

- [ ] **Step 3: Implement**

Add `coverage: Optional[dict[str, int]] = None` as the last field of `RaceResult` in `model.py` (so every existing positional constructor keeps working), and:

```python
# pipeline/bellwether/results/county_agg.py
"""States with no statewide feed (WI, MI, NH, ...): read the largest counties, add them up. The call engine treats the counties we did not read
as vote still to come, so partial coverage makes calls later, never wrong."""
from __future__ import annotations

from .model import Cand, RaceResult


def combine(state: str, race_id: str, per_county: dict[str, RaceResult], counties_total: int, source: str, source_url: str = "") -> RaceResult | None:
    votes: dict[tuple[str, str], int] = {}
    counties: dict[str, list[int]] = {}
    for name, r in per_county.items():
        if r.total <= 0:
            continue
        row = [0, 0, 0]
        for c in r.cands:
            votes[(c.name, c.party)] = votes.get((c.name, c.party), 0) + c.votes
            row["DRO".index(c.party if c.party in ("D", "R") else "O")] += c.votes
        counties[name] = row
    if not counties:
        return None
    cands = [Cand(n, p, v) for (n, p), v in sorted(votes.items(), key=lambda kv: -kv[1])]
    return RaceResult(race_id, state, cands, len(counties), counties_total, source, source_url, None, None, counties,
                      {"counties_read": len(counties), "counties_total": counties_total})
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest -q pipeline`
Expected: PASS

- [ ] **Step 5: Key-state readers (per-state work, each ships alone)**

Using the framework, in priority order (the closest Senate and governor races in `web/public/data/races.json`, then swing House states): for each state whose feed fits no platform, (1) save a real sample file (blocking, as in Tasks 14-16), (2) write a failing test from it, (3) add a `pipeline/bellwether/results/<state>.py` with `parse`/`fetch` returning `list[RaceResult]`, (4) register it in `readers_from_config`, (5) commit with that state's name. For WI/MI/NH, `fetch` calls the county readers listed in a new `"counties"` list in that state's `live_sources.json` entry and returns `county_agg.combine(...)` results. Stop adding states at the Oct. 25 freeze; record what is done in `docs/reader-status.md`.

- [ ] **Step 6: Commit**

```bash
git add pipeline/bellwether/results pipeline/tests/test_county_agg.py
git commit -m "County aggregation for states without a statewide feed"
```

---

### Task 18: Rehearsal harness with real-shape drills and zero-wrong-call check

**Files:**
- Create: `pipeline/tools/rehearse_night.py`, `pipeline/tests/test_rehearse_night.py`
- Modify: `pipeline/bellwether/results/replay.py`

**Interfaces:**
- Produces: `Replay(final, hours=4.0, lean=0.0)` (new `lean` argument: non-leading candidates are counted faster early by up to `lean`, so early counts lean toward the eventual loser); `rehearse_night.run_night(lean: float, steps: int = 40, drills: bool = False) -> dict` returning `{"wrong_calls": int, "calls": int, "races": int, "log": list[...]}`.

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_rehearse_night.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from rehearse_night import run_night  # noqa: E402


def test_no_wrong_calls_at_early_leans_up_to_forty_percent():
    for lean in (0.0, 0.2, 0.4):
        out = run_night(lean=lean, steps=30)
        assert out["races"] >= 20 and out["calls"] > 0 and out["wrong_calls"] == 0, f"lean={lean}: {out['wrong_calls']} wrong of {out['calls']}"   # the five fixtures give about 28 races


def test_drills_never_produce_a_wrong_call_or_a_crash():
    out = run_night(lean=0.2, steps=30, drills=True)
    assert out["wrong_calls"] == 0
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest -q pipeline/tests/test_rehearse_night.py`
Expected: FAIL (`ModuleNotFoundError: rehearse_night`)

- [ ] **Step 3: Add `lean` to `Replay`**

In `replay.py#Replay.__init__` add `lean: float = 0.0` (store as `self.lean`). In `read()`, replace the loop that scales votes (`for c in n.cands: c.votes = int(c.votes * f)`) with:

```python
            ordered = sorted(n.cands, key=lambda c: -c.votes)
            for rank, c in enumerate(ordered):
                # the eventual leader is counted at exactly f; everyone else is counted faster early (up to `lean`), converging at f = 1
                factor = f if rank == 0 else min(1.0, f * (1 + self.lean * (1 - f)))
                c.votes = int(c.votes * factor)
```
Run the existing replay tests; Expected PASS.

- [ ] **Step 4: Write the harness**

```python
# pipeline/tools/rehearse_night.py
"""Replay finished 2024 elections (AK, CO, GA, MN, NC fixtures) through the real worker, with the call engine on, and check every call
against the final result. Failure drills (a feed down, junk, votes going backward) can be switched on.

  python pipeline/tools/rehearse_night.py --lean 0.2 --drills --out /tmp/live      # writes results.json / status.json after every step"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bellwether.results import alaska, clarity, enhanced_voting, minnesota, north_carolina, worker  # noqa: E402
from bellwether.results.context import Context  # noqa: E402
from bellwether.results.replay import Replay  # noqa: E402

FX = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "results"


def finals() -> dict[str, list]:
    import json
    return {
        "AK": alaska.parse((FX / "ak_2024.csv").read_text(), 2024),
        "CO": clarity.parse((FX / "co_2024_summary.csv").read_text(), "CO", 2024),
        "GA": enhanced_voting.parse(json.loads((FX / "ga_2024_ballot-items.json").read_text()), "GA", 2024),
        "NC": north_carolina.parse((FX / "nc_2024.tsv").read_text(), 2024),
        "MN": minnesota.parse((FX / "mn_2024_ussenate.txt").read_text(), 2024) + minnesota.parse((FX / "mn_2024_ushouse.txt").read_text(), 2024),
    }


def build_context(final_by_state: dict[str, list]) -> tuple[Context, dict[str, str]]:
    """Sides come from each final result's top two candidates; the schedule opens at the start of the replay."""
    sides, truth, races = {}, {}, []
    for st, rows in final_by_state.items():
        for r in rows:
            cs = sorted(r.cands, key=lambda c: -c.votes)
            if len(cs) < 2:
                continue
            d = next((c for c in cs if c.party == "D"), cs[0])
            rep = next((c for c in cs if c.party == "R"), cs[1] if cs[0] is d else cs[0])
            sides[r.race_id] = {"dname": d.name, "dparty": d.party, "rname": rep.name, "rparty": rep.party, "rules": {}, "office": "house", "kind": "two_party", "state": st}
            truth[r.race_id] = "dside" if d.votes > rep.votes else "rside"
            races.append({"id": r.race_id, "office": "house", "kind": "two_party", "state": st, "dside": {"party": d.party}, "rside": {"party": rep.party}})
    sched = {"states": [{"state": st, "first": 0, "last": 0} for st in final_by_state]}
    meta = {"senate_not_up": {"D": 32, "R": 31, "I_caucus_D": 2}, "senate_majority": 51, "house_majority": 218, "vp": "R"}
    return Context(sides, {}, sched, races, meta), truth


def run_night(lean: float, steps: int = 40, drills: bool = False, out: Path | None = None) -> dict:
    fin = {st: rows for st, rows in finals().items() if rows}
    ctx, truth = build_context(fin)
    replays = {st: Replay(rows, hours=4.0, lean=lean) for st, rows in fin.items()}
    readers = {st: rp.read for st, rp in replays.items()}
    start = datetime(2026, 11, 4, 0, 0, tzinfo=timezone.utc)
    prev, wrong, called_ids = None, 0, set()
    for i in range(steps + 1):
        minute = i * 240 / steps
        for rp in replays.values():
            rp.at(minute)
        if drills:
            replays["GA"].fault = "down" if 8 <= i <= 12 else "junk" if 14 <= i <= 16 else "decrease" if 18 <= i <= 20 else None
        now = (start + timedelta(minutes=minute)).isoformat()
        res, st = worker.run_once(readers, prev, {}, now=now, ctx=ctx)
        prev = {"results": res, "status": st}
        for rid, c in res["calls"].items():
            if c["state"] == "called":
                called_ids.add(rid)
                wrong += c["winner"] != truth[rid]
        if out:
            worker.write(res, st, out)
    return {"wrong_calls": wrong, "calls": len(called_ids), "races": len(truth), "log": prev["results"]["call_log"]}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lean", type=float, default=0.2)
    ap.add_argument("--drills", action="store_true")
    ap.add_argument("--out", type=Path, default=None)
    a = ap.parse_args()
    r = run_night(a.lean, drills=a.drills, out=a.out)
    print(f"{r['calls']} of {r['races']} races called, {r['wrong_calls']} wrong")
    sys.exit(1 if r["wrong_calls"] else 0)
```

Note: the replayed 2024 fixtures use 2024 race ids; `build_context` derives sides, truth and the schedule from the fixtures themselves, so the 2026 `races.json` is not needed here.

- [ ] **Step 5: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_rehearse_night.py`
Expected: PASS. If a wrong call appears, **do not change the test**: raise the strictness in `data/config/call_rules.json`, rerun Task 5's simulations, and record the change in `docs/call-validation.md`.

- [ ] **Step 6: Full-path rehearsals (Oct. 26 and Oct. 29-30)**

With R2 configured (`docs/live-storage-setup.md`): run `python3 pipeline/tools/rehearse_night.py --lean 0.2 --drills --out live` from the repo root, then upload the two files with `python3 -m bellwether.results.run --upload-only --out live` (add that flag: it calls `upload()` once and exits), build the site with `NEXT_PUBLIC_LIVE_URL` set, and walk through: live block appears, calls and withdrawals read sensibly, stale/blocked labels show during the drills, kill switch hides the live view. Record results and screenshots in `docs/rehearsal-log.md`.

- [ ] **Step 7: Commit**

```bash
git add pipeline/tools/rehearse_night.py pipeline/tests/test_rehearse_night.py pipeline/bellwether/results/replay.py pipeline/bellwether/results/run.py docs/rehearsal-log.md
git commit -m "Rehearsal harness: real worker path, adversarial early counts, drills, zero-wrong-call check"
```

---

### Task 19: Load test (feeds the Oct. 20 hosting decision)

**Files:**
- Create: `pipeline/tools/load_test.py`, `pipeline/tests/test_load_test.py`

**Interfaces:** `load_test.summarize(latencies_ms: list[float], errors: int, bytes_total: int, seconds: float) -> dict` returning `{"requests": int, "errors": int, "p50_ms": float, "p95_ms": float, "rps": float, "mb": float}`.

- [ ] **Step 1: Write the failing test**

```python
# pipeline/tests/test_load_test.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from load_test import summarize  # noqa: E402


def test_summarize_reports_percentiles_and_errors():
    out = summarize([float(x) for x in range(1, 101)], errors=3, bytes_total=2_000_000, seconds=10)
    assert out["requests"] == 100 and out["errors"] == 3
    assert out["p50_ms"] == 50.5 and 95 <= out["p95_ms"] <= 96
    assert out["rps"] == 10.0 and out["mb"] == 2.0
```

- [ ] **Step 2: Run to verify failure, then implement**

Run: `python3 -m pytest -q pipeline/tests/test_load_test.py`; Expected: FAIL.

```python
# pipeline/tools/load_test.py
"""Poll results.json the way visitors' browsers do (every 15 s each) and report latency, errors and bytes.

  python pipeline/tools/load_test.py https://pub-xxxx.r2.dev/live/results.json --clients 2000 --seconds 60
Run it against the rehearsal bucket, never against another organisation's site. Keep --clients modest from one machine (threads), and
repeat from a few machines to approximate a crowd."""
from __future__ import annotations

import argparse
import statistics
import threading
import time
import urllib.request


def summarize(latencies_ms: list[float], errors: int, bytes_total: int, seconds: float) -> dict:
    s = sorted(latencies_ms)
    p95 = s[min(len(s) - 1, int(0.95 * len(s)))] if s else 0.0
    return {"requests": len(s), "errors": errors, "p50_ms": round(statistics.median(s), 1) if s else 0.0, "p95_ms": float(p95),
            "rps": round(len(s) / seconds, 1) if seconds else 0.0, "mb": round(bytes_total / 1e6, 2)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--clients", type=int, default=200)
    ap.add_argument("--seconds", type=int, default=60)
    ap.add_argument("--every", type=float, default=15.0)
    a = ap.parse_args()
    lat: list[float] = []
    errs = [0]
    total = [0]
    lock = threading.Lock()
    end = time.time() + a.seconds

    def client(i: int) -> None:
        time.sleep((i % int(a.every * 10)) / 10)   # spread starts so they do not all hit at once
        while time.time() < end:
            t = time.time()
            try:
                with urllib.request.urlopen(urllib.request.Request(a.url, headers={"Accept-Encoding": "gzip"}), timeout=20) as r:
                    n = len(r.read())
                with lock:
                    lat.append((time.time() - t) * 1000)
                    total[0] += n
            except Exception:  # noqa: BLE001
                with lock:
                    errs[0] += 1
            time.sleep(max(0.0, a.every - (time.time() - t)))

    threads = [threading.Thread(target=client, args=(i,), daemon=True) for i in range(a.clients)]
    t0 = time.time()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    print(summarize(lat, errs[0], total[0], time.time() - t0))


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run to verify pass**

Run: `python3 -m pytest -q pipeline/tests/test_load_test.py`
Expected: PASS

- [ ] **Step 4: Measure and record (by Oct. 20)**

Measure the gzipped size of `results.json` from a full rehearsal night (target under 200 KB; if larger, trim `call_log`, drop `counties` from non-statewide races, or split `results.json` into `results.json` + `detail/<state>.json` and note that in the commit). Run the tool at 500, 2,000 and 5,000 clients against the rehearsal bucket and record the numbers, the Vercel traffic estimate from `docs/live-storage-setup.md`, and a recommendation (Vercel Pro vs Cloudflare Pages) in `docs/load-test.md`. The decision belongs to the owner.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tools/load_test.py pipeline/tests/test_load_test.py docs/load-test.md
git commit -m "Load test tool and hosting recommendation inputs"
```

---

### Task 20: Runbook, go/no-go checklist and handoff

**Files:**
- Create: `docs/election-night-runbook.md`
- Modify: `docs/HANDOFF.md`, `docs/reader-status.md`, `docs/correction-guide.md`

- [ ] **Step 1: Write the runbook in plain language for the owner**

`docs/election-night-runbook.md` must contain, in this order: (1) **What happens by itself** (auto-start at 4 p.m. ET Nov. 3, three chained jobs, the live view switching on at the first poll closing, calls appearing, link-outs for unreadable states); (2) **What you may need to do** (almost nothing; the three actions below); (3) **Kill switch**: edit `data/config/live_overrides.json`, set `"live": false`, commit on GitHub's web editor, effect within about a minute plus the 15-second poll; set it back to `true` to return; (4) **Hold one race open**: add `{"race_id": "...", "action": "undecided", "reason": "..."}` to `holds`; (5) **Pause one bad feed**: add the state code to `pause_states`; (6) **What each alert issue means** ("results are not reaching storage" = check R2 secrets and the running job; "feed is stale: XX" = that state's site is down or blocking us, the site already shows a delayed notice, nothing to do unless it persists for an hour); (7) **If the whole thing fails**: set `live` to `false`; the site is the forecast again; (8) **After election night**: Georgia runoff Dec. 1, Louisiana House runoffs Dec. 12, ranked-choice tabulations in Maine and Alaska.

- [ ] **Step 2: Add the go/no-go checklist (Nov. 1)**

Every Senate and governor state is "Automatic" or "Link" on `/status` (none unknown); R2 and the four secrets plus `LIVE_URL` and `NEXT_PUBLIC_LIVE_URL` are set; hosting decision made; kill switch tested end to end in the last rehearsal; `call_rules.json` approved by the owner and recorded in `docs/call-validation.md`; last rehearsal had zero wrong calls; auto-start tested with a `workflow_dispatch` rehearsal run; the Oct. 25 freeze respected.

- [ ] **Step 3: Update `docs/HANDOFF.md`**

Add a section "1l. Election night (sub-project A)" listing what is built, what is blocked on fixtures (Tasks 14-16 per state), and where the runbook, validation, rehearsal log and load test live. Remove the stale "Not done" bullets from section 1f that this plan completed.

- [ ] **Step 4: Verify everything and commit**

Run: `python3 -m pytest -q pipeline && npm --prefix web run test:live && npx --prefix web tsc --noEmit -p web && npm --prefix web run build`
Expected: all PASS.

```bash
git add docs
git commit -m "Election-night runbook, go/no-go checklist, handoff"
```

---

## Self-review

**Spec coverage** (spec section -> task):
- 2 Architecture and data flow: Tasks 9 (worker, calls, publish, kill switch), 13 (source map readiness).
- 3 Readers and coverage: Tasks 14-17 (platform adapters, county aggregation, key-state), 13 (link-out fallback, readiness), 12 (probe-driven).
- 4 Call engine: Tasks 1-6 (rules, sides, baseline/expected vote, projection, validation, withdrawals), 7 (polls closed), 8 (chamber control, governor draws).
- 5 Pages: Tasks 10 (race page), 11 (live home), 13 (state pages, status).
- 6 Testing, rehearsal, launch: Tasks 5, 18, 19, 20, 12 (unattended running, alerts).
- 7 Success criteria: Tasks 5 and 18 (zero wrong calls), 9 and 13 (source and freshness, link-out), 19 (load).
- 9 Open items: owner approves `call_rules.json` (Tasks 5, 20), hosting (Task 19), R2 setup (Task 12 checklist).

**Deviations from the spec, all stated at the top:** unit-count calls are strict by design with county mode as the way to call earlier; expected vote is 2024 baseline plus a learned turnout ratio (2022 only if a real source is found); readers for unseen formats are blocked until a real file exists; monitoring is in the worker loop.

**Placeholder scan:** the only intentionally unfilled items are those that need a real file nobody has yet (Tasks 14-16, per-state key readers, `results_links.json` content, `probe_sample.json`), each with an explicit blocking first step and acceptance test shape. No other TBD/TODO.

**Type consistency:** `Call`/`CallBook` dict keys (`state, winner, leader, p_leader, margin, sd, mode, reason, called_at, withdrawn_at`) match `LiveCall` in Task 10; `chambers` keys match `LiveChamber`; `coverage.link_out_states` matches the web usage; `RaceResult.coverage` matches `LiveRace.coverage`; `decide_call(race, info, baseline, closed)` is called with those arguments in Task 9 and the simulations.
