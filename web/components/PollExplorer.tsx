"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

export type PollRow = { id: string; race: string; office: string; state: string; pollster: string; grade: string | null; start: string; end: string; n: number | null; pop: string | null; answers: string; adjusted: number | null; url: string | null; internal: boolean; sponsors: string };

const PAGE = 50;
const OFFICE: Record<string, string> = { senate: "Senate", house: "House", governor: "Governor" };
const day = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function PollExplorer({ rows }: { rows: PollRow[] }) {
  const [q, setQ] = useState("");
  const [office, setOffice] = useState("all");
  const [pop, setPop] = useState("all");
  const [shown, setShown] = useState(PAGE);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => (office === "all" || r.office === office) && (pop === "all" || (r.pop ?? "") === pop)
      && (!t || `${r.race} ${r.state} ${r.pollster} ${r.sponsors} ${r.answers}`.toLowerCase().includes(t)));
  }, [rows, q, office, pop]);
  const reset = () => setShown(PAGE);
  return (
    <>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", margin: "8px 0 16px", alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 240px" }}><span className="kicker">Search</span><br />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="Race, state, pollster, sponsor…" style={{ width: "100%", minHeight: 40 }} />
        </label>
        <div><span className="kicker">Office</span><br />
          <div className="toggle" role="group" aria-label="Office">
            {[["all", "All"], ["senate", "Senate"], ["house", "House"], ["governor", "Governor"]].map(([k, l]) => <button key={k} aria-pressed={office === k} onClick={() => { setOffice(k); reset(); }}>{l}</button>)}
          </div>
        </div>
        <div><span className="kicker">Who was polled</span><br />
          <div className="toggle" role="group" aria-label="Population">
            {[["all", "All"], ["lv", "Likely voters"], ["rv", "Registered"]].map(([k, l]) => <button key={k} aria-pressed={pop === k} onClick={() => { setPop(k); reset(); }}>{l}</button>)}
          </div>
        </div>
      </div>
      <p className="small muted" aria-live="polite">{hits.length.toLocaleString("en-US")} poll{hits.length === 1 ? "" : "s"}</p>
      <div className="table-wrap">
        <table className="data cards">
          <caption className="sr-only">Race polls, newest first</caption>
          <thead><tr><th>Race</th><th>Pollster</th><th>Dates</th><th className="r">Sample</th><th>Result</th><th className="r">Adjusted</th></tr></thead>
          <tbody>
            {hits.slice(0, shown).map((r, i) => (
              <tr key={`${r.id}-${i}`}>
                <td data-label="Race"><Link href={`/race/${r.id}/`}><strong>{r.race}</strong></Link><div className="small muted">{OFFICE[r.office]}</div></td>
                <td data-label="Pollster">{r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer">{r.pollster}</a> : r.pollster}{r.grade && <span className="small muted"> · {r.grade}</span>}{r.internal && <span className="small muted"> · internal</span>}{r.sponsors && <div className="small muted">for {r.sponsors}</div>}</td>
                <td data-label="Dates" className="num">{r.start === r.end ? day(r.end) : `${day(r.start)}–${day(r.end)}`}</td>
                <td data-label="Sample" className="r num">{r.n ? `${r.n.toLocaleString("en-US")}${r.pop ? " " + r.pop.toUpperCase() : ""}` : "—"}</td>
                <td data-label="Result">{r.answers || "—"}</td>
                <td data-label="Adjusted" className="r num">{r.adjusted == null ? "—" : `${r.adjusted >= 0 ? "D" : "R"} +${Math.abs(r.adjusted).toFixed(1)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown < hits.length && <p style={{ textAlign: "center", margin: "16px 0" }}><button className="btn" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, hits.length - shown)} more</button></p>}
    </>
  );
}
