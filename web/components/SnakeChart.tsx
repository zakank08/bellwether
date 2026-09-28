"use client";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useMemo } from "react";
import type { CompactRow } from "@/lib/data";
import { BUCKET_LABEL, bucketVar, in100, onBucket } from "@/lib/format";
import type { Version } from "@/lib/types";
import { useTip } from "./Tooltip";

/** Races ordered from the Democrats' strongest to the Republicans' strongest,
 * each segment one seat. The segment where the Democratic count reaches a
 * majority is the likely tipping point. */
export default function SnakeChart({ rows, v, baseD, needed }: { rows: CompactRow[]; v: Version; baseD: number; needed: number }) {
  const reduce = useReducedMotion();
  const { show, hide } = useTip();
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.p[v] - a.p[v]) || ((b.margin[v] ?? 0) - (a.margin[v] ?? 0))), [rows, v]);
  // The segment where Democratic wins (D-side candidates who are Democrats) reach the majority.
  let tipIdx = -1;
  { let c = 0; for (let i = 0; i < sorted.length; i++) { if (sorted[i].dside.party === "D") c++; if (c === needed - baseD) { tipIdx = i; break; } } }
  return (
    <div>
      <div style={{ display: "flex", gap: 2, alignItems: "stretch" }} role="list" aria-label="Races ordered by projected margin">
        {sorted.map((r, i) => {
          const b = r.rating[v];
          return (
            <Link key={r.id} href={`/race/${r.id}/`} role="listitem" style={{ flex: 1, minWidth: 0, textDecoration: "none" }}
              onMouseMove={(e) => show(e, <><strong>{r.title}</strong><br />{BUCKET_LABEL[b]} · projected {r.margin[v] == null ? "—" : `${(r.margin[v]! >= 0 ? r.dside.name : r.rside.name) ?? ""} +${Math.abs(r.margin[v]!).toFixed(1)}`}<br /><span className="muted">{r.dside.name} {in100(r.p[v])} in 100</span></>)}
              onMouseLeave={hide} aria-label={`${r.title}: ${BUCKET_LABEL[b]}`}>
              <motion.div animate={{ backgroundColor: bucketVar(b) }} transition={reduce ? { duration: 0 } : { duration: 0.4 }}
                style={{ height: 44, borderRadius: 2, outline: i === tipIdx ? "2px solid var(--ink)" : undefined, outlineOffset: 1,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: onBucket(b), overflow: "hidden" }}>
                <span className="hide-narrow">{r.state}</span>
              </motion.div>
            </Link>
          );
        })}
      </div>
      <div className="small muted" style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span>← Most likely Democratic (or non-Republican)</span>
        <span>Most likely Republican →</span>
      </div>
      <p className="small muted" style={{ margin: "4px 0 0" }}>Outlined: the seat that takes Democrats to {needed}, counting the {baseD} seats they and allied independents hold that aren’t up.</p>
      <style>{`@media (max-width: 719px){ .hide-narrow{ display:none } }`}</style>
    </div>
  );
}
