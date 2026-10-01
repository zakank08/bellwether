import type { Metadata } from "next";
import Link from "next/link";
import { getForecast, getRaces } from "@/lib/data";
import { bucketScore, expertScore, median, scoreBucket, scoreLabel } from "@/lib/experts";
import { flipOf, flipShort } from "@/lib/flips";
import { BUCKET_LABEL, bucketVar, in100, onBucket, surname } from "@/lib/format";

export const metadata: Metadata = {
  title: "Bellwether vs. expert ratings",
  description: "Our odds next to the published race ratings of Cook, Sabato, Inside Elections and others, with where they differ.",
};

const ORGS = ["Cook", "Sabato", "Inside Elections", "Split Ticket", "Split Ticket/FPO", "Silver Bulletin", "DDHQ", "The Economist", "RCP", "Fox News"];

function Chip({ label }: { label: string }) {
  const s = expertScore(label);
  const b = s == null ? null : scoreBucket(s);
  return <span className="chip" style={b ? { background: bucketVar(b), color: onBucket(b) } : undefined}>{label.replace(/ \(flip\)/, "")}</span>;
}

export default function Ratings() {
  const f = getForecast();
  const v = f.default_version;
  const all = getRaces().filter((r) => r.kind === "two_party" && r.experts && Object.keys(r.experts).length);
  const sections = (["senate", "governor"] as const).map((o) => ({
    o, label: o === "senate" ? "Senate" : "Governors",
    rows: all.filter((r) => r.office === o).map((r) => {
      const scores = Object.values(r.experts).map(expertScore).filter((x): x is number => x != null);
      const mid = scores.length ? Math.round(median(scores)) : null;
      const ours = bucketScore(r.rating[v]);
      return { r, mid, ours, gap: mid != null && ours != null ? ours - mid : null, n: scores.length };
    }).sort((a, b) => Math.abs(a.r.p[v] - 0.5) - Math.abs(b.r.p[v] - 0.5)),
  }));
  const usedOrgs = ORGS.filter((o) => all.some((r) => r.experts[o]));
  const differ = sections.flatMap((s) => s.rows).filter((x) => x.gap != null && Math.abs(x.gap) >= 1).length;
  const total = sections.flatMap((s) => s.rows).length;
  const towardD = sections.flatMap((s) => s.rows).filter((x) => x.gap != null && x.gap > 0).length;
  const towardR = sections.flatMap((s) => s.rows).filter((x) => x.gap != null && x.gap < 0).length;
  return (
    <div className="wrap">
      <section className="block" style={{ paddingTop: 32 }}>
        <h1 className="display">Bellwether vs. expert ratings</h1>
        <p className="takeaway">
          Professional race raters publish a category for each contest: solid, likely, lean or toss-up. Here are those ratings next to our odds. Our rating uses the same scale: solid is 95 in 100 or better, likely 75–95, lean 60–75, toss-up under 60 for either side.
          Of {total} Senate and governor races they rate, our category differs from the experts’ middle rating in <strong className="num">{differ}</strong> (<span className="num">{towardD}</span> sit toward D, <span className="num">{towardR}</span> toward R).
        </p>
        <p className="small muted">
          Ratings are collected from Wikipedia’s 2026 election pages, which cite each publisher. A “step” is one category (for example lean to likely). “Toward D” or “toward R” says which way our rating sits relative to the experts’ middle rating. Neither is a claim that one is right: ratings are judgment, ours is a model, and both can be wrong. House ratings are not collected here.
        </p>
      </section>
      {sections.map((s) => (
        <section className="block" key={s.o} aria-labelledby={`${s.o}-h`}>
          <h2 id={`${s.o}-h`} className="display">{s.label}</h2>
          <div className="table-wrap ratings-wrap">
            <table className="data ratings">
              <caption className="sr-only">{s.label}: Bellwether rating and expert ratings, closest races first</caption>
              <thead><tr>
                <th>Race</th><th>Bellwether</th><th>Experts’ middle</th><th>Compared</th>
                {usedOrgs.map((o) => <th key={o}>{o}</th>)}
              </tr></thead>
              <tbody>
                {s.rows.map(({ r, mid, gap, n }) => {
                  const fl = flipOf(r, v);
                  const b = r.rating[v];
                  return (
                    <tr key={r.id}>
                      <td><Link href={`/race/${r.id}/`}><strong>{r.title}</strong></Link>{fl && <><br /><span className={`flip-chip${fl.tier === "could" ? " could" : ""}`}>{flipShort(fl)}</span></>}</td>
                      <td><span className="chip" style={{ background: bucketVar(b), color: onBucket(b) }}>{BUCKET_LABEL[b]}</span><br /><span className="small num muted">{surname(r.dside.name)} {in100(r.p[v])} in 100</span></td>
                      <td>{mid == null ? "—" : <span className="chip" style={{ background: bucketVar(scoreBucket(mid)), color: onBucket(scoreBucket(mid)) }}>{scoreLabel(mid)}</span>}<br /><span className="small muted">{n} raters</span></td>
                      <td className="small">{gap == null ? "—" : gap === 0 ? "Same" : `${Math.abs(gap)} step${Math.abs(gap) > 1 ? "s" : ""} toward ${gap > 0 ? "D" : "R"}`}</td>
                      {usedOrgs.map((o) => <td key={o}>{r.experts[o] ? <Chip label={r.experts[o]} /> : <span className="muted">—</span>}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
