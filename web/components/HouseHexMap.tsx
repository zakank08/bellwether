"use client";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { CompactRow } from "@/lib/data";
import { BUCKET_LABEL, bucketVar } from "@/lib/format";
import { hexLayout, hexPath } from "@/lib/layout";
import type { Version } from "@/lib/types";
import { tipLinesFor } from "./MapBits";
import { useTip } from "./Tooltip";

/** Every House district on the 2026 lines as an equal-size hexagon, grouped by
 * state. Equal sizes mean a Manhattan district counts as much as all of Montana. */
export default function HouseHexMap({ rows, v }: { rows: CompactRow[]; v: Version }) {
  const byKey = useMemo(() => Object.fromEntries(rows.map((r) => [`${r.state}-${r.district === 0 ? 1 : r.district}`, r])), [rows]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows) c[r.state] = (c[r.state] ?? 0) + 1; return c; }, [rows]);
  const { cells, blocks, box, R } = useMemo(() => hexLayout(counts), [counts]);
  const [hoverSt, setHoverSt] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -60px 0px" }) || !!reduce;
  const { show, hide } = useTip();
  const router = useRouter();
  return (
    <svg ref={ref} viewBox={box.join(" ")} width="100%" role="img" aria-label="Map of all 435 House districts, one hexagon each" style={{ display: "block" }}>
      {blocks.map((b) => (
        <text key={b.st} x={b.x + b.w / 2 - Math.sqrt(3) / 2} y={b.y - 1.35 * R} fontSize={1.05} textAnchor="middle"
          fill={hoverSt === b.st ? "var(--ink)" : "var(--ink-muted)"} fontWeight={600} style={{ transition: "fill .2s" }}>{b.st}</text>
      ))}
      {cells.map((c, i) => {
        const r = byKey[`${c.st}-${c.d}`];
        if (!r) return null;
        const b = r.rating[v];
        const dim = hoverSt && hoverSt !== c.st;
        return (
          <motion.path key={r.id} d={hexPath(c.x, c.y, R * 0.94)}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={seen ? { opacity: dim ? 0.35 : 1, scale: 1, fill: bucketVar(b) } : { opacity: 0, scale: 0.4 }}
            transition={reduce ? { duration: 0 } : { opacity: { duration: 0.25 }, scale: { delay: seen ? (c.x / box[2]) * 0.7 + (i % 7) * 0.01 : 0, type: "spring", stiffness: 260, damping: 20 }, fill: { duration: 0.4 } }}
            style={{ transformBox: "fill-box", transformOrigin: "center", cursor: "pointer" }}
            onMouseEnter={() => setHoverSt(c.st)}
            onMouseMove={(e) => show(e, <><strong>{r.title}</strong> · {BUCKET_LABEL[b]}<br />{tipLinesFor(r.dside.name, r.dside.party, r.rside.name, r.rside.party, r.p[v])}</>)}
            onMouseLeave={() => { hide(); setHoverSt(null); }}
            onClick={() => router.push(`/race/${r.id}/`)} />
        );
      })}
    </svg>
  );
}
