# Election night: fixing a number by hand (one page)

Use this only when a state's results page breaks, shows something clearly wrong, or a recount makes you want a
race held open. The site shows hand-entered numbers as **"Entered by hand from <source>"**, so readers can see it.

## Where to edit
1. Open https://github.com/zakank08/bellwether/blob/main/data/config/live_overrides.json
2. Click the **pencil icon** (top right of the file) to edit.
3. Make the change below, scroll down, click **Commit changes**, choose **Commit directly to the main branch**, click **Commit changes**.
4. Within about a minute the worker picks it up (the site updates within another 15 seconds). No rebuild needed.
   (This only works while the election-night job is running.)

If you make a typo, the worker ignores that one entry and shows a "Hand-correction problem" line at the top of the site (visible to everyone, so fix it quickly). Nothing else breaks.

## A. A state's feed is wrong or down: type the numbers in
Copy this into the `"results"` list (the square brackets). Numbers come from the state's official page or a county page; write where in `source`.
```json
{"race_id": "2026-sen-GA",
 "cands": [{"name": "Jane Doe", "party": "D", "votes": 1203441},
           {"name": "John Roe", "party": "R", "votes": 1188002}],
 "units_reporting": 1400, "units_total": 2600,
 "source": "Georgia Secretary of State results page, 11:42 p.m.",
 "reason": "State feed has been down since 10:55 p.m."}
```
`party` is `D`, `R` or `O` (anyone else). Race ids look like `2026-sen-GA`, `2026-house-PA-07`, `2026-gov-GA`. Use plain digits for votes (no commas).
Update the same entry as new numbers arrive. To go back to the automatic feed, delete the entry.

## B. Hold a race open (recount, error found), or mark it by hand
Add to the `"holds"` list:
```json
{"race_id": "2026-house-PA-07", "action": "undecided", "reason": "Recount requested"}
```
`action` is `undecided`, `decided_dside` or `decided_rside`. Do not use `decided_*` unless a state or the candidate has made it plain;
Bellwether never calls a race on its own authority, so this is rare.

## C. Stop reading a state completely
Put its two-letter code in `"pause_states"`: `"pause_states": ["GA"]`. Its last good numbers stay on the site.

## What the worker already does without you
- A vote count that goes **down**, an empty feed, or a negative number is rejected; the last good numbers stay and the state shows as delayed.
- If a state's site is unreachable, the site says it is delayed and shows when it last updated.
- Hand entries are marked, and never replaced silently by the feed: delete your entry when the feed is healthy again.
