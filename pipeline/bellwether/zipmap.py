"""ZIP code -> congressional district lookup files for "Find my races".

Source: Census 2020 ZCTA to 119th Congress relationship file (land area in
each part). ZCTAs approximate USPS ZIP codes. For the ten states that redrew
their maps for 2026, 119th-Congress districts are *not* the 2026 districts, so
those ZIPs are mapped to the state only and the site says so plainly.

Output: web/public/data/zip/<first two digits>.json  {zip: [[state, district|null, share], ...]}
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

from .house_history import REDRAWN_SINCE_2024
from .tiles_fips import FIPS

SRC = Path(__file__).resolve().parents[2] / "data" / "history" / "cd119_zcta.txt"


def build(out_dir: Path):
    if not SRC.exists():
        return 0
    parts: dict[str, dict[tuple, float]] = defaultdict(lambda: defaultdict(float))
    with open(SRC, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter="|"):
            z = r["GEOID_ZCTA5_20"]
            if not z:
                continue
            geo = r["GEOID_CD119_20"]
            st = FIPS.get(geo[:2])
            if not st:
                continue
            cd = int(geo[2:]) if geo[2:].isdigit() else None
            if cd in (98, 99):   # non-voting / undefined
                continue
            key = (st, None if st in REDRAWN_SINCE_2024 else cd)
            parts[z][key] += float(r["AREALAND_PART"] or 0)
    shards: dict[str, dict] = defaultdict(dict)
    for z, m in parts.items():
        tot = sum(m.values()) or 1.0
        rows = sorted(([k[0], k[1], round(v / tot, 3)] for k, v in m.items()), key=lambda x: -x[2])
        rows = [x for x in rows if x[2] >= 0.01] or rows[:1]
        shards[z[:2]][z] = rows
    d = out_dir / "zip"
    d.mkdir(parents=True, exist_ok=True)
    for k, v in shards.items():
        (d / f"{k}.json").write_text(json.dumps(v, separators=(",", ":")))
    return len(parts)
