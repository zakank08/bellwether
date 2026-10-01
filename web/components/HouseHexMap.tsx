"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CompactRow } from "@/lib/data";
import { BUCKET_LABEL, bucketVar, in100 } from "@/lib/format";
import { hexLayout, hexPath } from "@/lib/layout";
import { flipLong, flipOf, flipShort, isRedrawnHouse } from "@/lib/flips";
import type { Version } from "@/lib/types";
import { tipLinesFor } from "./MapBits";
import { useTip } from "./Tooltip";
import { useReveal } from "./useReveal";

/** Every House district on the 2026 lines as an equal-size hexagon, grouped by
 * state. Equal sizes mean a Manhattan district counts as much as all of Montana. */
export default function HouseHexMap({ rows, v }: { rows: CompactRow[]; v: Version }) {
  const byKey = useMemo(() => Object.fromEntries(rows.map((r) => [`${r.state}-${r.district === 0 ? 1 : r.district}`, r])), [rows]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rows) c[r.state] = (c[r.state] ?? 0) + 1; return c; }, [rows]);
  const { cells, blocks, box, R } = useMemo(() => hexLayout(counts), [counts]);
  const [hoverSt, setHoverSt] = useState<string | null>(null);
  const { ref, hidden, animate, reduce } = useReveal<SVGSVGElement>();
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
        const flip = flipOf(r, v);
        return (
          <path key={r.id} d={hexPath(c.x, c.y, R * 0.94)}
            stroke={flip ? "var(--flip)" : "none"} strokeWidth={flip?.tier === "likely" ? 0.34 : flip ? 0.2 : 0} strokeLinejoin="round" paintOrder="stroke"
            style={{
              fill: bucketVar(b), opacity: hidden ? 0 : dim ? 0.35 : 1, transform: hidden ? "scale(0.4)" : "scale(1)", transformBox: "fill-box", transformOrigin: "center", cursor: "pointer",
              transition: reduce ? "none" : animate ? `opacity .25s, transform .5s cubic-bezier(.3,1.4,.5,1) ${Math.round(((c.x / box[2]) * 0.7 + (i % 7) * 0.01) * 1000)}ms, fill .4s` : "opacity .2s, fill .4s",
            }}
            onMouseEnter={() => setHoverSt(c.st)}
            onMouseMove={(e) => show(e, <><strong>{r.title}</strong> · {BUCKET_LABEL[b]}<br />{tipLinesFor(r.dside.name, r.dside.party, r.rside.name, r.rside.party, r.p[v])}{flip && <><br /><span className="flip-chip">{flipShort(flip)}</span><br /><span className="small">{flipLong(flip, in100, isRedrawnHouse(r))}</span></>}</>)}
            onMouseLeave={() => { hide(); setHoverSt(null); }}
            onClick={() => router.push(`/race/${r.id}/`)} />
        );
      })}
    </svg>
  );
}
