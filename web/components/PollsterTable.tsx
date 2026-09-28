"use client";
import { useMemo, useState } from "react";

type R = { pollster: string; polls: number; races: number; cycles: string[]; plus_minus_raw: number; plus_minus_adj: number; bias: number | null; transparency: number | null; aapor_roper: boolean; score: number; grade: string; weight: number; provisional: boolean };

export default function PollsterTable({ ratings, active }: { ratings: R[]; active: Set<string> | string[] }) {
  const act = useMemo(() => new Set(active), [active]);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(true);
  const [minPolls, setMin] = useState(10);
  const rows = ratings.filter((r) => r.polls >= minPolls && (!only || act.has(r.pollster)) && r.pollster.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a pollster" aria-label="Find a pollster"
          style={{ font: "inherit", fontSize: 14, height: 40, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 999, background: "var(--surface-raised)", color: "var(--ink)" }} />
        <div className="toggle" role="group" aria-label="Which pollsters">
          <button aria-pressed={only} onClick={() => setOnly(true)}>Polling in 2026</button>
          <button aria-pressed={!only} onClick={() => setOnly(false)}>All</button>
        </div>
        <label className="small">Min. polls <select value={minPolls} onChange={(e) => setMin(+e.target.value)} style={{ font: "inherit", height: 32, marginLeft: 4 }}>
          {[1, 5, 10, 25].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        <span className="small muted">{rows.length} pollsters</span>
      </div>
      <div className="table-wrap">
        <table className="data cards">
          <thead><tr><th>Pollster</th><th>Grade</th><th className="r">Polls rated</th><th className="r">Error vs. peers</th><th className="r">Lean</th><th className="r">Transparency</th><th className="r">Weight</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pollster}>
                <td data-label="Pollster">{r.pollster}{r.aapor_roper && <span className="small muted"> · AAPOR/Roper</span>}<div className="small muted">{r.cycles[0]}–{r.cycles[r.cycles.length - 1]}</div></td>
                <td data-label="Grade"><strong>{r.grade}</strong>{r.provisional && <span className="small muted"> (provisional)</span>}</td>
                <td data-label="Polls rated" className="r num">{r.polls}</td>
                <td data-label="Error vs. peers" className="r num">{r.plus_minus_adj > 0 ? "+" : ""}{r.plus_minus_adj.toFixed(2)}</td>
                <td data-label="Lean" className="r num">{r.bias == null ? "—" : `${r.bias > 0 ? "D" : "R"}+${Math.abs(r.bias).toFixed(1)}`}</td>
                <td data-label="Transparency" className="r num">{r.transparency ?? "—"}</td>
                <td data-label="Weight" className="r num">{r.weight.toFixed(2)}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
