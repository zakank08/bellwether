"""State demographics used for correlated-error factors and the
"what this place looks like" panels.

Preferred source: Census ACS 5-year API (needs a free CENSUS_API_KEY).
Fallback when no key is set: Wikipedia tables derived from Census data
(educational attainment; Hispanic/Latino share from the 2020 census;
Black/African American share), attributed on the site.
"""
from __future__ import annotations

import io
import json
import os
import re

import pandas as pd

from ..http import fetch, fetch_json
from ..states import STATES

WIKI = "https://en.wikipedia.org/w/api.php?action=parse&page={p}&prop=text&format=json&formatversion=2&redirects=1"
ACS = ("https://api.census.gov/data/2023/acs/acs5/profile?get=NAME,DP02_0068PE,DP05_0073PE,DP05_0079PE"
       "&for=state:*&key={key}")


def _num(x):
    m = re.search(r"-?\d+(?:\.\d+)?", str(x).replace(",", ""))
    return float(m.group()) if m else None


def _wiki_tables(page):
    h = json.loads(fetch(WIKI.format(p=page), max_age_s=30 * 86400))["parse"]["text"]
    return pd.read_html(io.StringIO(h))


def _flat(df):
    df = df.copy()
    df.columns = [" | ".join(dict.fromkeys(str(x) for x in c)) if isinstance(c, tuple) else str(c) for c in df.columns]
    return df


def state_demographics() -> dict:
    key = os.environ.get("CENSUS_API_KEY")
    if key:
        rows = fetch_json(ACS.format(key=key), max_age_s=30 * 86400)
        out = {}
        for name, bach, hisp, black, _ in rows[1:]:
            if name in STATES:
                out[STATES[name]] = {"college": float(bach), "hispanic": float(hisp), "black": float(black),
                                     "source": "Census ACS 2019–2023 5-year"}
        return out
    out = {st: {"source": "Wikipedia tables of Census data (fallback)"} for st in STATES.values()}
    t = _flat(_wiki_tables("List_of_U.S._states_and_territories_by_educational_attainment")[1])
    sc = t.columns[0]
    pc = [c for c in t.columns if "Bachelor" in c and "Pct" in c][0]
    for _, r in t.iterrows():
        st = STATES.get(re.sub(r"\[.*?\]", "", str(r[sc])).strip())
        if st:
            out[st]["college"] = _num(r[pc])
    t = _flat(_wiki_tables("List_of_U.S._states_by_Hispanic_and_Latino_population")[0])
    sc = t.columns[0]
    pc = [c for c in t.columns if "Per cent" in c and "2020" in c][0]
    for _, r in t.iterrows():
        st = STATES.get(re.sub(r"\[.*?\]", "", str(r[sc])).strip())
        if st:
            out[st]["hispanic"] = _num(r[pc])
    t = _flat(_wiki_tables("List_of_U.S._states_by_African-American_population")[0])
    sc = [c for c in t.columns if "State" in c][0]
    pc = [c for c in t.columns if c.startswith("%")][0]
    for _, r in t.iterrows():
        st = STATES.get(re.sub(r"\[.*?\]", "", str(r[sc])).strip())
        if st:
            out[st]["black"] = _num(r[pc])
    return out
