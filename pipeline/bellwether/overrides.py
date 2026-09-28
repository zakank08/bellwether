"""Apply hand corrections from data/config/overrides.json (auditable, versioned)."""
from __future__ import annotations

import json
from pathlib import Path

PATH = Path(__file__).resolve().parents[2] / "data" / "config" / "overrides.json"


def load() -> dict:
    return json.loads(PATH.read_text()) if PATH.exists() else {}


def apply(races):
    ov = load().get("races", {})
    for r in races:
        o = ov.get(r.id)
        if not o:
            continue
        if "incumbent_candidate" in o:
            for c in r.candidates:
                c.incumbent = c.name == o["incumbent_candidate"]
        for k in ("pvi", "open_seat"):
            if k in o:
                setattr(r, k, o[k])
        if o.get("reason"):
            r.notes.append(f"Correction: {o['reason']}")
    return races


def caucus_map() -> dict:
    return {k: v for k, v in load().get("independents_caucus", {}).items() if not k.startswith("_")}
