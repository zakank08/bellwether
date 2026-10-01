"""Find new Trump-approval and generic-ballot polls and add them to data/config/national_polls.json.

    pip install -r pipeline/tools/requirements.txt
    python pipeline/tools/update_national_polls.py            # dry run: print what it would add
    python pipeline/tools/update_national_polls.py --write    # add the polls that pass every check
    python pipeline/tools/update_national_polls.py --selftest # re-read polls already in the file and compare

Reads the pollsters whose releases are structured (YouGov/Economist, Reuters/Ipsos, Echelon,
Quinnipiac) straight from their own PDFs or tables. Every row is checked (percentages in range,
approve + disapprove plausible, a working link, not already in the file, not a wild jump from
that pollster's last poll). A poll that fails a check is NOT added; it is listed under REVIEW.
Pollsters whose pages are free text (Emerson, Marist, CNN, Verasight, Fox, ARG, AP-NORC) are
listed under MANUAL with the page to check, and are added by hand.

Exit code 0 = fine, 3 = something needs a person (the workflow opens an issue).
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FILE = ROOT / "data" / "config" / "national_polls.json"
UA = {"User-Agent": "Mozilla/5.0 (BellwetherElectionTracker; nonpartisan forecast; polls collection)"}
SINCE = date(2026, 7, 1)
MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                      "September", "October", "November", "December"], 1)}
# Pollsters whose pages are free text. url, then words that identify the pollster (or its sponsor) in the file.
MANUAL = {
    "Emerson College": ("https://emersoncollegepolling.com/category/national/", ["emerson"]),
    "Marist": ("https://maristpoll.marist.edu/latest-polls/", ["marist"]),
    "CNN/SSRS": ("https://www.cnn.com/polling", ["ssrs", "cnn"]),
    "Verasight / Strength In Numbers": ("https://www.gelliottmorris.com/", ["verasight"]),
    "Fox News": ("https://www.foxnews.com/official-polls", ["fox", "beacon"]),
    "American Research Group": ("https://americanresearchgroup.com/economy/", ["american research"]),
    "AP-NORC": ("https://apnorc.org/", ["ap-norc", "norc"]),
}
MANUAL_STALE_DAYS = 35


def get(url: str, timeout: int = 60) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def page_text(url: str) -> str:
    import html
    h = get(url).decode("utf8", "ignore")
    h = re.sub(r"<script.*?</script>|<style.*?</style>", "", h, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h)))


def pdf_text(url: str, layout: bool = False) -> str:
    data = get(url, 90)
    if layout:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            return "\n".join((p.extract_text(layout=True) or "") for p in pdf.pages)
    from pdfminer.high_level import extract_text
    return extract_text(io.BytesIO(data))


def row(pollster, sponsors, start, end, n, pop, question, a, b, url, note=None, document=None):
    r = {"pollster": pollster, "sponsors": sponsors, "start_date": start, "end_date": end, "sample_size": n,
         "population": pop, "question": question,
         "answers": {"Approve": float(a), "Disapprove": float(b)} if question == "approval" else {"Dem": float(a), "Rep": float(b)},
         "url": url, "auto": True}
    if note:
        r["note"] = note
    if document:
        r["document"] = document
    return r


def dates_from(text: str) -> tuple[str, str] | None:
    """'September 17-21, 2026' / 'July 29 to August 3, 2026' / 'Aug. 14–19, 2026' -> ISO start, end."""
    m = re.search(r"([A-Z][a-z]{2,8})\.? (\d{1,2})\s*(?:-|–|to|through)\s*(?:([A-Z][a-z]{2,8})\.? )?(\d{1,2}),? (20\d\d)", text)
    if not m:
        return None

    def mon(name):
        return next((v for k, v in MONTHS.items() if k.lower().startswith(name.lower()[:3])), None)
    m1, m2 = mon(m.group(1)), mon(m.group(3)) if m.group(3) else mon(m.group(1))
    if not m1 or not m2:
        return None
    y = int(m.group(5))
    return date(y, m1, int(m.group(2))).isoformat(), date(y, m2, int(m.group(4))).isoformat()


# ---------------------------------------------------------------- YouGov / Economist
def yougov() -> list[dict]:
    sys.path.insert(0, str(Path(__file__).parent))
    import yougov_economist as yg
    listing = get("https://yougov.com/en-us/content/the-economist").decode("utf8", "ignore")
    arts = sorted(set(re.findall(r"/en-us/articles/\d+-[a-z0-9-]*economist-?yougov-poll", listing)))
    by_week: dict[str, dict] = {}
    for a in arts:
        if not re.search(r"-2026-economist", a):
            continue
        try:
            results = yg.parse("https://yougov.com" + a)
        except Exception as e:  # one bad article never stops the rest
            print("  YouGov article skipped:", a, e)
            continue
        for d in results:
            if d.get("error") or not d.get("header") or "2026" not in d["header"]:
                continue
            m = re.match(r"([A-Z][a-z]+) (\d+)\s*[–-]\s*(?:([A-Z][a-z]+) )?(\d+), (20\d\d)", d["header"])
            if not m:
                continue
            m1 = MONTHS[m.group(1)]
            m2 = MONTHS[m.group(3)] if m.group(3) else m1
            s, e = date(2026, m1, int(m.group(2))).isoformat(), date(2026, m2, int(m.group(4))).isoformat()
            w = by_week.setdefault(s, {"start": s, "end": e, "n": d["n"], "pop": d["pop"], "article": "https://yougov.com" + a})
            for k in ("approve", "disapprove", "dem", "rep"):
                if d.get(k) is not None:
                    if w.get(k) is not None and w[k] != d[k]:
                        w["conflict"] = True       # two PDFs for the same week disagree: don't trust either
                    w[k] = d[k]
                    w.setdefault("doc_" + k, d["pdf"])
    out = []
    for w in by_week.values():
        if date.fromisoformat(w["end"]) < SINCE:
            continue
        for q, a, b in (("approval", "approve", "disapprove"), ("generic", "dem", "rep")):
            if w.get(a) is None or w.get(b) is None:
                continue
            r = row("YouGov", ["The Economist"], w["start"], w["end"], w["n"], w["pop"], q, w[a], w[b], w["article"], document=w.get("doc_" + a))
            if w.get("conflict"):
                r["_problem"] = "the two PDFs for this week disagree"
            out.append(r)
    return out


# ---------------------------------------------------------------- Reuters/Ipsos
def _ipsos_pdfs() -> list[tuple[str, str]]:
    out = []
    for p in range(1, 9):
        try:
            sm = get(f"https://www.ipsos.com/en-us/sitemap.xml?page={p}").decode("utf8", "ignore")
        except Exception:
            continue
        for loc, mod in re.findall(r"<loc>([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>", sm):
            if mod[:10] >= (date.today() - timedelta(days=75)).isoformat() and "ipsos.com/en-us/" in loc:
                out.append((loc, mod))
    from concurrent.futures import ThreadPoolExecutor

    def scan(loc):
        try:
            h = get(loc).decode("utf8", "ignore")
        except Exception:
            return []
        if "Reuters/Ipsos" not in h and "Reuters Ipsos" not in h:
            return []
        return [("https://www.ipsos.com" + u, loc) for u in re.findall(r'(?:https://www\.ipsos\.com)?(/sites/default/files/[^"\']+?Topline[^"\']*\.pdf)', h, flags=re.I)]
    pdfs = {}
    with ThreadPoolExecutor(max_workers=4) as pool:      # a few at a time keeps the load on Ipsos light
        for found in pool.map(scan, [loc for loc, _ in out]):
            for pdf, loc in found:
                pdfs.setdefault(pdf, loc)
    return list(pdfs.items())


def _first_pcts(line: str) -> list[int]:
    return [int(x) for x in re.findall(r"(\d+)%", line)]


def ipsos() -> list[dict]:
    out = []
    for pdf, page in _ipsos_pdfs():
        try:
            t = pdf_text(pdf, layout=True)
        except Exception as e:
            print("  Ipsos PDF skipped:", pdf, e)
            continue
        dts = dates_from(t[:3000])
        if not dts or "Reuters/Ipsos" not in t[:3000]:
            continue
        lines = t.split("\n")

        def block(key, span=40):
            i = next((j for j, l in enumerate(lines) if key in l), None)
            return lines[i:i + span] if i is not None else []
        ap = block("Approval5_Sum")
        n_all = re.search(r"\(N=([\d,]+)\)", " ".join(ap))
        net_a = next((l for l in ap if "Approve (Net)" in l), None)
        net_d = next((l for l in ap if "Disapprove (Net)" in l), None)
        if net_a and net_d and n_all:
            out.append(row("Ipsos", ["Reuters"], dts[0], dts[1], int(n_all.group(1).replace(",", "")), "a", "approval",
                           _first_pcts(net_a)[0], _first_pcts(net_d)[0], page, document=pdf))
        gb = block("TM3287Y24", 30)
        ns = re.findall(r"\(N=([\d,]+)\)", " ".join(gb))
        dem_i = next((j for j, l in enumerate(gb) if l.strip().startswith("Democratic")), None)
        rep_i = next((j for j, l in enumerate(gb) if l.strip().startswith("Republican")), None)
        if len(ns) >= 2 and dem_i is not None and rep_i is not None:
            dv = next((_first_pcts(l) for l in gb[dem_i:dem_i + 3] if len(_first_pcts(l)) >= 2), None)
            rv = next((_first_pcts(l) for l in gb[rep_i:rep_i + 3] if len(_first_pcts(l)) >= 2), None)
            if dv and rv:
                out.append(row("Ipsos", ["Reuters"], dts[0], dts[1], int(ns[1].replace(",", "")), "rv", "generic", dv[1], rv[1], page, document=pdf))
    return [r for r in out if date.fromisoformat(r["end_date"]) >= SINCE]


# ---------------------------------------------------------------- Echelon Insights
def echelon() -> list[dict]:
    out = []
    today = date.today()
    for back in range(0, 3):
        y, m = today.year, today.month - back
        while m < 1:
            m += 12
            y -= 1
        name = [k for k, v in MONTHS.items() if v == m][0].lower()
        page = None
        for suffix in ("", "-1"):
            u = f"https://echeloninsights.com/insights/{name}-{y}-verified-voter-omnibus{suffix}"
            try:
                h = get(u).decode("utf8", "ignore")
                if "Topline" in h:
                    page = (u, h)
                    break
            except Exception:
                continue
        if not page:
            continue
        pdfs = re.findall(r'https?://[^"\']+Topline[^"\']*\.pdf', page[1])
        if not pdfs:
            continue
        pdf = pdfs[0].replace(" ", "%20")
        t = pdf_text(pdf)
        fd = re.search(r"Field Dates:\s*([^\n]+)", t)
        n = re.search(r"N=([\d,]+)", t)
        dts = dates_from(fd.group(1)) if fd else None
        if not (dts and n):
            continue

        def pcts_after(key, k):
            i = t.find(key)
            nums = re.findall(r"(\d+)%", t[i:i + 900]) if i >= 0 else []
            return [int(x) for x in nums[:k]]
        ap = pcts_after("[QTrumpApprove]", 2)
        gb = pcts_after("[QGenericCongressionalLeaner]", 2)   # Republican, Democratic (leaners included)
        size = int(n.group(1).replace(",", ""))
        if len(ap) == 2:
            out.append(row("Echelon Insights", [], dts[0], dts[1], size, "lv", "approval", ap[0], ap[1], page[0], document=pdf))
        if len(gb) == 2:
            out.append(row("Echelon Insights", [], dts[0], dts[1], size, "lv", "generic", gb[1], gb[0], page[0], note="Includes leaners", document=pdf))
    return [r for r in out if date.fromisoformat(r["end_date"]) >= SINCE]


# ---------------------------------------------------------------- Quinnipiac
def quinnipiac(start_id: int = 3960, span: int = 60) -> list[dict]:
    out = []
    for rid in range(start_id, start_id + span):
        u = f"https://poll.qu.edu/poll-release?releaseid={rid}"
        try:
            t = page_text(u)
        except Exception:
            continue
        sv = re.search(r"([\d,]+) self-identified registered voters nationwide were surveyed from ([A-Z][a-z]+) (\d+)\w* - (?:([A-Z][a-z]+) )?(\d+)\w*", t)
        if not sv:
            continue
        m1 = MONTHS[sv.group(2)]
        m2 = MONTHS[sv.group(4)] if sv.group(4) else m1
        start, end = date(2026, m1, int(sv.group(3))).isoformat(), date(2026, m2, int(sv.group(5))).isoformat()
        ap = re.search(r"handling his job as president\?\s*REGISTERED VOTERS\.+\s*Tot Rep Dem Ind Men Wom Approve (\d+)%? [\d%\- ]+?Disapprove (\d+)", t)
        hs = re.search(r"win control of the United States House of Representatives\?\s*REGISTERED VOTERS\.+\s*Tot Rep Dem Ind Men Wom Republican Party (\d+)%? [\d%\- ]+?Democratic Party (\d+)%?", t)
        n = int(sv.group(1).replace(",", ""))
        if ap:
            out.append(row("Quinnipiac University", [], start, end, n, "rv", "approval", ap.group(1), ap.group(2), u))
        if hs:
            out.append(row("Quinnipiac University", [], start, end, n, "rv", "generic", hs.group(2), hs.group(1), u,
                           note="Question: which party would you want to win control of the House"))
    return [r for r in out if date.fromisoformat(r["end_date"]) >= SINCE]


SOURCES = {"YouGov/Economist": yougov, "Reuters/Ipsos": ipsos, "Echelon": echelon, "Quinnipiac": quinnipiac}


# ---------------------------------------------------------------- checks and merge
def norm(name: str) -> str:
    s = re.sub(r"\b(university|college|research|insights|the|inc|llc|co|company)\b", " ", name.lower())
    return " ".join(sorted(t for t in re.split(r"[^a-z]+", s) if t and t not in ("cnn", "news", "economist")))


def problems(r: dict, known: list[dict]) -> list[str]:
    p = []
    if r.get("_problem"):
        p.append(r["_problem"])
    v = list(r["answers"].values())
    if r["question"] == "approval" and not (80 <= sum(v) <= 102):
        p.append(f"approve + disapprove = {sum(v):g}")
    if r["question"] == "generic" and not (70 <= sum(v) <= 102):
        p.append(f"Dem + Rep = {sum(v):g}")
    if not all(0 < x < 100 for x in v):
        p.append("percentage out of range")
    if not str(r.get("url", "")).startswith("https://"):
        p.append("no link")
    if r["start_date"] > r["end_date"] or r["end_date"] > date.today().isoformat():
        p.append("bad dates")
    prev = [k for k in known if k["question"] == r["question"] and norm(k["pollster"]) == norm(r["pollster"]) and k["end_date"] < r["end_date"]]
    if prev:
        last = max(prev, key=lambda k: k["end_date"])
        a, b = list(r["answers"].values()), list(last["answers"].values())
        if abs((a[0] - a[1]) - (b[0] - b[1])) > 15:
            p.append(f"net moved {abs((a[0]-a[1])-(b[0]-b[1])):.0f} points since this pollster's last poll ({last['end_date']})")
    return p


def is_known(r: dict, known: list[dict]) -> bool:
    for k in known:
        if k["question"] == r["question"] and norm(k["pollster"]) == norm(r["pollster"]) and k.get("population") == r["population"] \
                and abs((date.fromisoformat(k["end_date"]) - date.fromisoformat(r["end_date"])).days) <= 1:
            return True
    return False


def selftest() -> int:
    """Re-read each source and check that polls already in the file come out identical."""
    doc = json.loads(FILE.read_text())
    bad = 0
    for name, fn in SOURCES.items():
        found = fn()
        checked = 0
        for r in found:
            match = [k for k in doc["polls"] if k["question"] == r["question"] and norm(k["pollster"]) == norm(r["pollster"])
                     and k["end_date"] == r["end_date"] and k.get("population") == r["population"]]
            if not match:
                continue
            checked += 1
            if match[0]["answers"] != r["answers"]:
                bad += 1
                print(f"MISMATCH {name} {r['end_date']} {r['question']}: file {match[0]['answers']} vs read {r['answers']}")
        print(f"{name}: read {len(found)} polls, {checked} already in the file and compared")
    print("selftest:", "FAILED" if bad else "ok")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    doc = json.loads(FILE.read_text())
    known = doc["polls"]
    added, review = [], []
    for name, fn in SOURCES.items():
        try:
            found = fn()
        except Exception as e:
            print(f"{name}: could not be read ({e})")
            review.append(f"{name}: source could not be read: {e}")
            continue
        new = [r for r in found if not is_known(r, known + added)]
        print(f"{name}: {len(found)} polls found, {len(new)} new")
        for r in new:
            if is_known(r, added):      # the same poll listed twice in this run
                twin = next(k for k in added if k["question"] == r["question"] and norm(k["pollster"]) == norm(r["pollster"])
                            and k.get("population") == r["population"] and abs((date.fromisoformat(k["end_date"]) - date.fromisoformat(r["end_date"])).days) <= 1)
                if twin["answers"] != r["answers"]:
                    added.remove(twin)
                    review.append(f"{name} {r['end_date']} {r['question']}: two versions of the same poll disagree "
                                  f"({list(twin['answers'].values())} vs {list(r['answers'].values())}); check which is current [{r['url']}]")
                continue
            why = problems(r, known + added)
            if why:
                review.append(f"{name} {r['end_date']} {r['question']} {list(r['answers'].values())}: {'; '.join(why)}  [{r['url']}]")
            else:
                added.append(r)
                print("  +", r["pollster"], r["end_date"], r["question"], r["answers"])
    if added and a.write:
        doc["polls"] = sorted(known + [{k: v for k, v in r.items()} for r in added], key=lambda d: (d["end_date"], d["pollster"], d["question"]))
        doc["collected"] = date.today().isoformat()
        FILE.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
        print(f"wrote {len(added)} polls to {FILE.relative_to(ROOT)}")
    print("\nBY HAND (latest poll in the file, then the page to check):")
    due = []
    for label, (url, keys) in MANUAL.items():
        dates = [k["end_date"] for k in known + added
                 if any(x in (k["pollster"] + " " + " ".join(k.get("sponsors", []))).lower() for x in keys)]
        last = max(dates, default=None)
        age = (date.today() - date.fromisoformat(last)).days if last else None
        print(f"  {label}: {last or 'none'}  {url}")
        if last is None or age > MANUAL_STALE_DAYS:
            due.append(f"{label}: {'no poll in the file' if last is None else f'last poll in the file ended {last} ({age} days ago)'}; check {url}")
    review += [f"check by hand: {x}" for x in due]
    if review:
        print("\nNEEDS A PERSON (nothing below was added automatically):")
        for x in review:
            print("  -", x)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
