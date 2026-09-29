"use client";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo, useRef } from "react";
import { BUCKET_LABEL, bucketVar } from "@/lib/format";
import { hemicycle } from "@/lib/layout";
import type { Bucket } from "@/lib/types";
import { useTip } from "./Tooltip";

export type Seat = { key: string; bucket: Bucket | "notup-d" | "notup-r"; id?: string; tip?: React.ReactNode };

/** Hemicycle of every seat in a chamber, safest Democratic on the left to
 * safest Republican on the right. Seats fill in along the arc on first view. */
export default function SeatArc({ seats, majority, label, compact = false }: { seats: Seat[]; majority: number; label: string; compact?: boolean }) {
  const { pts, seatR } = useMemo(() => hemicycle(seats.length), [seats.length]);
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { once: true }) || !!reduce;
  const { show, hide } = useTip();
  const router = useRouter();
  const fill = (b: Seat["bucket"]) => (b === "notup-d" ? "var(--d-lean)" : b === "notup-r" ? "var(--r-lean)" : bucketVar(b as Bucket));
  const majAngle = pts[majority - 1] ? Math.atan2(-pts[majority - 1].y, pts[majority - 1].x) : Math.PI / 2;
  return (
    <svg ref={ref} viewBox="-1.08 -1.08 2.16 1.2" width="100%" role="img" aria-label={label} style={{ display: "block", maxWidth: compact ? 420 : 640, overflow: "visible" }}>
      {seats.map((s, i) => {
        const p = pts[i];
        if (!p) return null;
        return (
          <motion.circle key={s.key} cx={p.x} cy={p.y} r={seatR}
            initial={reduce ? false : { opacity: 0, scale: 0 }}
            animate={seen ? { opacity: 1, scale: 1, fill: fill(s.bucket) } : { opacity: 0, scale: 0 }}
            transition={reduce ? { duration: 0 } : { delay: seen ? (i / seats.length) * 0.9 : 0, type: "spring", stiffness: 300, damping: 18, fill: { duration: 0.4, delay: 0 } }}
            style={{ transformBox: "fill-box", transformOrigin: "center", cursor: s.id ? "pointer" : "default" }}
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
