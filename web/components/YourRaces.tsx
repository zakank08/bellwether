"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CompactRow } from "@/lib/data";
import { visit, type FollowEntry } from "@/lib/follow";
import { BUCKET_LABEL, bucketVar, in100, onBucket, surname } from "@/lib/format";
import type { Version } from "@/lib/types";
import { Delta } from "./Sparkline";

/** Races this reader follows, with the change since their last visit. Hidden
 * entirely until they follow something. */
export default function YourRaces({ rows, v }: { rows: CompactRow[]; v: Version }) {
  const [f, setF] = useState<Record<string, FollowEntry> | null>(null);
  useEffect(() => {
    const cur = Object.fromEntries(rows.map((r) => [r.id, r.p[v]]));
    setF(visit(cur));
    const on = () => setF(visit(cur));
    window.addEventListener("bw-follow", on);
    return () => window.removeEventListener("bw-follow", on);
  }, [rows, v]);
  if (!f || !Object.keys(f).length) return null;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const list = Object.entries(f).filter(([id]) => byId[id]);
  return (
    <section className="block" aria-labelledby="yours-h" id="yours">
      <h2 id="yours-h" className="display big">Your races</h2>
      <p className="takeaway small">Races you follow, with the change since your last visit. Saved in this browser only.</p>
      <div className="race-card-grid">
        {list.map(([id, e]) => {
          const r = byId[id], b = r.rating[v], p = r.p[v];
          return (
            <Link key={id} href={`/race/${id}/`} className="race-card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="kicker">{r.office === "senate" ? "Senate" : r.office === "house" ? "House" : "Governor"}</span>
                <span className="chip" style={{ background: bucketVar(b), color: onBucket(b) }}>{BUCKET_LABEL[b]}</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 18, margin: "6px 0 8px" }}>{r.title}</div>
              <div className="row small" style={{ justifyContent: "space-between" }}>
                <span>{surname(r.dside.name)} <strong className="num">{in100(p)}</strong> · {surname(r.rside.name)} <strong className="num">{in100(1 - p)}</strong></span>
                <Delta from={e.prev} to={p} dName={r.dside.name} rName={r.rside.name} dParty={r.dside.party} rParty={r.rside.party} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
