import type { Metadata } from "next";
import Link from "next/link";
import { ApprovalTracker, GenericTracker } from "@/components/Trackers";
import { getApproval, getGeneric } from "@/lib/data";
import { coverage } from "@/lib/coverage";
import { fmtDate, partyMarginLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Generic ballot and approval" };

function Coverage({ polls, asof, what }: { polls: { end: string; src?: string }[]; asof: string; what: string }) {
  const c = coverage(polls, asof);
  return (
    <p className={c.thin ? "small notice" : "small muted"} role={c.thin ? "status" : undefined}>
      {c.recent} {what} polls ended in the last 30 days{c.latest ? `; the latest ended ${fmtDate(c.latest)}` : ""}.
      {c.fromReleases > 0 && ` ${c.fromReleases} of them were entered from the pollsters’ own releases because our main poll feed doesn’t carry them.`}
      {c.thin && " With this few recent polls the average leans on older ones and may be out of date."}
    </p>
  );
}

export default function Polls() {
  const g = getGeneric();
  const a = getApproval();
  const recent = [...g.polls].sort((x, y) => (x.end < y.end ? 1 : -1)).slice(0, 25);
  return (
    <div className="wrap">
      <section className="block" style={{ paddingTop: 32 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><h1 className="display">Generic ballot</h1><Link href="/pollsters/" className="small">Pollster ratings →</Link></div>
        <p className="takeaway">Asked which party they’d back for Congress, voters favor <strong>{g.average >= 0 ? "Democrats" : "Republicans"}</strong> by <strong className="num">{Math.abs(g.average).toFixed(1)}</strong> points in the average of {g.n_polls} recent polls (adjusted for house effects and likely voters).</p>
        <GenericTracker trend={g.trend} polls={g.polls} />
        <Coverage polls={g.polls} asof={g.trend[g.trend.length - 1]?.date ?? ""} what="generic-ballot" />
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="data cards">
            <thead><tr><th>Pollster</th><th>End date</th><th className="r">Sample</th><th className="r">Result</th><th className="r">Adjusted</th></tr></thead>
            <tbody>{recent.map((p, i) => (
              <tr key={i}><td data-label="Pollster">{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer">{p.pollster}</a> : p.pollster}</td><td data-label="End date">{fmtDate(p.end)}</td>
                <td data-label="Sample" className="r num">{p.n?.toLocaleString() ?? "—"} {p.pop?.toUpperCase()}</td><td data-label="Result" className="r num">{partyMarginLabel(p.raw)}</td><td data-label="Adjusted" className="r num">{partyMarginLabel(p.adjusted)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="block">
        <h2 className="display">Presidential approval</h2>
        <p className="takeaway">President Trump’s net approval (approve minus disapprove) averages <strong className="num">{a.net.toFixed(1)}</strong>. Unpopular presidents usually cost their party seats in midterms; the model uses this as a weak prior on the national environment.</p>
        <ApprovalTracker trend={a.trend} polls={a.polls} />
        <Coverage polls={a.polls} asof={a.trend[a.trend.length - 1]?.date ?? ""} what="approval" />
      </section>
    </div>
  );
}
