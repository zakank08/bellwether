"""Read the Economist/YouGov weekly poll's Trump approval and generic ballot
straight from YouGov's topline/crosstab PDFs, for data/config/national_polls.json.

    pip install pdfminer.six
    python pipeline/tools/yougov_economist.py <yougov.com article URL> [...]

Prints one JSON line per PDF linked from the article, with the dates, sample
and population taken from the PDF's own header. Check the numbers against the
PDF before adding them to national_polls.json; never add a poll this script
could not read.
"""
import re, sys, json, subprocess, io, urllib.request
from pdfminer.high_level import extract_text
UA={"User-Agent":"Mozilla/5.0 (BellwetherElectionTracker research)"}
def get(u): return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60).read()
def pct(block, label):
    m=re.search(re.escape(label)+r"[ .]*?(\d+)%", block); return int(m.group(1)) if m else None
def parse(article):
    h=get(article).decode("utf8","ignore")
    pdfs=sorted(set(re.findall(r'https://d3nkl3psvxxpe9\.cloudfront\.net/documents/econ(?:toplines|TabReport)_[^"\s]+\.pdf',h)))
    if not pdfs: return [{"article":article,"error":"no toplines pdf"}]
    return [parse_pdf(article,p) for p in pdfs]
def parse_pdf(article,pdf):
    t=extract_text(io.BytesIO(get(pdf)))
    hdr=re.search(r"([A-Z][a-z]+ \d+\s*[–-]\s*(?:[A-Z][a-z]+ )?\d+, 20\d\d) - (\d+) U\.S\. (Registered Voters|Adult Citizens|Adults|Likely Voters)",t,re.I)
    out={"article":article,"pdf":pdf,"header":hdr.group(0) if hdr else None,"n":int(hdr.group(2)) if hdr else None,"pop":(("rv" if "registered" in hdr.group(3).lower() else "lv" if "likely" in hdr.group(3).lower() else "a") if hdr else None)}
    if "TabReport" in pdf: return crosstab(out,t)
    i=t.find("approve or disapprove of the way Donald Trump is handling his job as President")
    if i>=0:
        b=t[i:i+600]; out["approve"]=pct(b,"Total Approve"); out["disapprove"]=pct(b,"Total Disapprove")
    j=-1
    for q in GQ:
        j=t.find(q)
        if j>=0: break
    if j>=0:
        b=t[j:j+800]; out["dem"]=pct(b,"The Democratic candidate") or pct(b,"Democratic Party candidate"); out["rep"]=pct(b,"The Republican candidate") or pct(b,"Republican Party candidate")
        out["gq"]=t[j:j+120].replace("\n"," ")
    return out

GQ=["In the elections for U.S. Congress in November, who will you vote for in the district where you live?","If the elections for U.S. Congress were being held today, who would you vote for in the district where you live?"]
def first_pcts(t, anchor, k):
    i=t.find(anchor)
    if i<0: return None
    j=t.find("College grad", i)
    if j<0 or j-i>3000: return None
    return [int(x) for x in re.findall(r"(\d+)%", t[j:j+400])[:k]]
def crosstab(out,t):
    a=first_pcts(t,"Do you approve or disapprove of the way Donald Trump is handling his job as President?",2)
    if a: out["approve"],out["disapprove"]=a
    g=None
    for q in GQ:
        g=first_pcts(t,q,2)
        if g: break
    if g: out["dem"],out["rep"]=g
    return out

for a in sys.argv[1:]:
    try:
        for r in parse(a): print(json.dumps(r))
    except Exception as e: print(json.dumps({"article":a,"error":str(e)}))
