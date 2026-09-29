"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CompactRow } from "@/lib/data";
import { BUCKET_LABEL, bucketVar, in100 } from "@/lib/format";
import type { Bucket, Version } from "@/lib/types";
import { useTip } from "./Tooltip";
import { tipLinesFor } from "./MapBits";

const ORDER: Bucket[] = ["d-safe", "i-safe", "d-likely", "i-likely", "d-lean", "i-lean", "tossup", "r-lean", "r-likely", "r-safe"];

/** All 435 seats as squares, from the safest Democratic seat to the safest
 * Republican one. The 218th square from either end marks the majority. */
export default function HouseWaffle({ rows, v }: { rows: CompactRow[]; v: Version }) {
  const [state, setState] = useState<string>("");
  const reduce = useReducedMotion();
  const { show, hide } = useTip();
  const router = useRouter();
  const sorted = useMemo(() => {
    const dshare = (r: CompactRow) => (r.dside.party === "R" ? 1 - r.p[v] : r.p[v]);
    return [...rows].sort((a, b) => dshare(b) - dshare(a));
  }, [rows, v]);
  const cols = 29, size = 20, gap = 3;
  const n = sorted.length;
  const rowsN = Math.ceil(n / cols);
  const W = cols * (size + gap), H = rowsN * (size + gap);
  const states = useMemo(() => [...new Set(rows.map((r) => r.state))].sort(), [rows]);
  // column-major snake so the colour runs left to right
  const pos = (i: number) => { const c = Math.floor(i / rowsN), r = i % rowsN; return [c * (size + gap), (c % 2 ? rowsN - 1 - r : r) * (size + gap)]; };
  const majIdx = 217;
  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <label className="small" htmlFor="house-state">Highlight a state</label>
        <select id="house-state" value={state} onChange={(e) => setState(e.target.value)}
          style={{ font: "inherit", fontSize: 14, height: 36, borderRadius: 6, border: "1px solid var(--line)", background: "var(--surface-raised)", color: "var(--ink)", padding: "0 8px" }}>
          <option value="">All states</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} width="100%" role="img" aria-label="All 435 House seats ordered from safest Democratic to safest Republican" style={{ display: "block", maxWidth: 760 }}>
        {sorted.map((r, i) => {
          const [x, y] = pos(i);
          const dim = state && r.state !== state;
          return (
            <motion.rect key={r.id} layout={!reduce} x={x} y={y} width={size} height={size} rx={2}
              animate={{ fill: bucketVar(r.rating[v]), opacity: dim ? 0.18 : 1 }}
              transition={reduce ? { duration: 0 } : { duration: 0.4 }}
              style={{ cursor: "pointer" }} tabIndex={-1}
              onMouseMove={(e) => show(e, <><strong>{r.title}</strong> · {BUCKET_LABEL[r.rating[v]]}<br />{tipLinesFor(r.dside.name, r.dside.party, r.rside.name, r.rside.party, r.p[v])}</>)}
              onMouseLeave={hide} onClick={() => router.push(`/race/${r.id}/`)} />
          );
        })}
        {(() => { const [x, y] = pos(majIdx); return <rect x={x - 1.5} y={y - 1.5} width={size + 3} height={size + 3} rx={3} fill="none" stroke="var(--ink)" strokeWidth={2} pointerEvents="none" />; })()}
      </svg>
      <p className="small muted">Outlined square: the 218th seat counting from the Democratic side — whoever wins it and everything to its left has a majority. Select a square to open the race.</p>
    </div>
  );
}
