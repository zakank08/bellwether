"use client";
import Link from "next/link";
import type { CompactRow } from "@/lib/data";
import { BUCKET_LABEL, bucketVar, in100, onBucket, partyInk, surname } from "@/lib/format";
import type { Version } from "@/lib/types";
import Sparkline from "./Sparkline";

/** Compact race table that collapses to cards on phones. */
export default function RaceList({ rows, v, caption, showPolls = true, sparks }: { rows: CompactRow[]; v: Version; caption: string; showPolls?: boolean; sparks?: Record<string, number[]> }) {
  if (!rows.length) return <p className="muted">No races match.</p>;
  return (
    <div className="table-wrap">
      <table className="data cards">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr><th>Race</th><th>Rating</th>{sparks && <th>Last 30 days</th>}<th>Non-Republican side</th><th>Republican side</th><th className="r">Projected margin</th>{showPolls && <th className="r">Polls</th>}</tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const b = r.rating[v];
            const m = r.margin[v];
            return (
              <tr key={r.id}>
                <td data-label="Race"><Link href={`/race/${r.id}/`}><strong>{r.title}</strong></Link>{r.rules?.runoff && r.p_runoff ? <span className="small muted"> · runoff {in100(r.p_runoff)} in 100</span> : null}</td>
                <td data-label="Rating"><span className="chip" style={{ background: bucketVar(b), color: onBucket(b) }}>{BUCKET_LABEL[b]}</span></td>
                {sparks && <td data-label="Last 30 days">{sparks[r.id] ? <Sparkline values={sparks[r.id]} dParty={r.dside.party} rParty={r.rside.party} label={`${r.title}: trend over the last 30 days`} /> : <span className="muted small">—</span>}</td>}
                <td data-label="Non-Republican side"><span style={{ color: partyInk(r.dside.party) }}>{r.dside.name ?? "—"}</span>{r.dside.party && r.dside.party !== "D" ? <span className="muted"> ({r.dside.party})</span> : null}<br /><strong className="num">{r.kind === "two_party" ? `${in100(r.p[v])} in 100` : r.kind === "uncontested" ? "Unopposed" : "Settled"}</strong></td>
                <td data-label="Republican side"><span style={{ color: partyInk(r.rside.party) }}>{r.rside.name ?? "—"}</span>{r.rside.party && r.rside.party !== "R" ? <span className="muted"> ({r.rside.party})</span> : null}<br />{r.kind === "two_party" && <strong className="num">{in100(1 - r.p[v])} in 100</strong>}</td>
                <td data-label="Projected margin" className="r num">{m == null ? "—" : `${m >= 0 ? (surname(r.dside.name) || "D") : (surname(r.rside.name) || "R")} +${Math.abs(m).toFixed(1)}`}</td>
                {showPolls && <td data-label="Polls" className="r num">{r.n_polls || <span className="muted">none</span>}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
