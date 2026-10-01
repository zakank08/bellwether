"""Build web/public/data/county2024.json: 2024 presidential vote by county, used as the background of the county maps
(and as context next to live county results on election night).

Source: Tony McGovern's compilation of Fox News county results (github.com/tonmcg/US_County_Level_Election_Results_08-24).
The compilation says it is not authoritative. Alaska (reported by state House district) and Connecticut (reported by town)
do not match county shapes, so they are left out and the maps say "county detail not available" there.

  python pipeline/tools/county_2024.py            # downloads, writes the JSON
"""
from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path

URL = "https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2024_US_County_Level_Presidential_Results.csv"
OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "county2024.json"
SKIP = {"Alaska", "Connecticut"}


def build(text: str) -> dict:
    counties = {}
    for r in csv.DictReader(io.StringIO(text)):
        if r["state_name"] in SKIP or not r["county_fips"]:
            continue
        counties[r["county_fips"]] = [int(r["votes_dem"]), int(r["votes_gop"]), int(r["total_votes"])]
    return {
        "source": "Fox News 2024 county results, compiled by Tony McGovern (github.com/tonmcg/US_County_Level_Election_Results_08-24). Not authoritative.",
        "note": "Alaska (reported by state House district) and Connecticut (reported by town) are omitted because they do not match county shapes.",
        "fields": ["democratic votes", "republican votes", "total votes"],
        "counties": counties,
    }


if __name__ == "__main__":
    import urllib.request
    text = urllib.request.urlopen(URL, timeout=60).read().decode("utf-8")
    d = build(text)
    OUT.write_text(json.dumps(d, separators=(",", ":")))
    print(f"{len(d['counties'])} counties -> {OUT}")
    if len(d["counties"]) < 3000:
        sys.exit("fewer counties than expected; check the source")
