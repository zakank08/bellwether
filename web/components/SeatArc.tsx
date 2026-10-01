"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { BUCKET_LABEL, bucketVar } from "@/lib/format";
import { hemicycle } from "@/lib/layout";
import type { Bucket } from "@/lib/types";
import { useTip } from "./Tooltip";
import { useReveal } from "./useReveal";

export type Seat = { key: string; bucket: Bucket | "notup-d" | "notup-r"; id?: string; tip?: React.ReactNode; flip?: "likely" | "could" };

/** Hemicycle of every seat in a chamber, safest Democratic on the left to safest Republican on the right.
 * A yellow ring marks a seat likely to change parties. Shown fully drawn on load; dots only fill in
 * along the arc if the chart starts below the visible screen. */
export default function SeatArc({ seats, majority, label, compact = false }: { seats: Seat[]; majority: number; label: string; compact?: boolean }) {
  const { pts, seatR } = useMemo(() => hemicycle(seats.length), [seats.length]);
  const { ref, hidden, animate, reduce } = useReveal<SVGSVGElement>();
  const { show, hide } = useTip();
  const router = useRouter();
  const fill = (b: Seat["bucket"]) => (b === "notup-d" ? "var(--d-lean)" : b === "notup-r" ? "var(--r-lean)" : bucketVar(b as Bucket));
  const majAngle = pts[majority - 1] ? Math.atan2(-pts[majority - 1].y, pts[majority - 1].x) : Math.PI / 2;
  return (
    <svg ref={ref} viewBox="-1.08 -1.08 2.16 1.2" width="100%" role="img" aria-label={label} style={{ display: "block", maxWidth: compact ? 420 : 640, overflow: "visible" }}>
      {seats.map((s, i) => {
        const p = pts[i];
        if (!p) return null;
        const delay = animate ? Math.round((i / seats.length) * 900) : 0;
        return (
          <circle key={s.key} cx={p.x} cy={p.y} r={seatR}
            stroke={s.flip ? "var(--flip)" : "none"} strokeWidth={s.flip === "likely" ? seatR * 0.55 : s.flip === "could" ? seatR * 0.32 : 0} paintOrder="stroke"
            style={{
              fill: fill(s.bucket), opacity: hidden ? 0 : 1, transform: hidden ? "scale(0)" : "scale(1)", transformBox: "fill-box", transformOrigin: "center",
              cursor: s.id ? "pointer" : "default",
              transition: reduce ? "none" : animate ? `opacity .3s ${delay}ms, transform .5s cubic-bezier(.3,1.5,.5,1) ${delay}ms, fill .4s` : "fill .4s",
            }}
            onMouseMove={s.tip ? (e) => show(e, s.tip) : undefined} onMouseLeave={s.tip ? hide : undefined}
            onClick={s.id ? () => router.push(`/race/${s.id}/`) : undefined} />
        );
      })}
      <line x1={0.36 * Math.cos(majAngle)} y1={-0.36 * Math.sin(majAngle)} x2={1.06 * Math.cos(majAngle)} y2={-1.06 * Math.sin(majAngle)}
        stroke="var(--ink)" strokeWidth={0.008} strokeDasharray="0.02 0.02" />
      <text x={0} y={0.06} textAnchor="middle" fontSize={0.075} fill="var(--ink-muted)" fontWeight={600}>{majority} for a majority</text>
    </svg>
  );
}

export { BUCKET_LABEL };
