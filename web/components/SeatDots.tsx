"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type { Hist } from "@/lib/types";

/** 100 simulated outcomes dropping into a seat histogram: each dot is one
 * "in 100" outcome, so the reader can count uncertainty. */
export default function SeatDots({ hist, majority, label, partyAt }: {
  hist: Hist[]; majority: number; label: string; partyAt: (seats: number) => "D" | "R" | "C";
}) {
  const reduce = useReducedMotion();
  const { dots, bin } = useMemo(() => {
    const cum: { seats: number; c: number }[] = [];
    let c = 0;
    for (const h of hist) { c += h.p; cum.push({ seats: h.seats, c }); }
    const raw = Array.from({ length: 100 }, (_, k) => cum.find((x) => x.c >= (k + 0.5) / 100)?.seats ?? cum[cum.length - 1].seats);
    const span = raw[99] - raw[0];
    const bin = span > 40 ? 5 : span > 20 ? 2 : 1;
    const seats = raw.map((s) => (bin === 1 ? s : Math.floor((s - majority) / bin) * bin + majority));
    const stack: Record<number, number> = {};
    // Drop order interleaves the distribution so the shape builds up evenly.
    const order = Array.from({ length: 100 }, (_, i) => i).sort((a, b) => ((a * 37) % 100) - ((b * 37) % 100));
    const placed = seats.map((s) => ({ s, h: 0 }));
    for (const s of seats) stack[s] = (stack[s] ?? 0) + 1;
    const fill: Record<number, number> = {};
    return { bin, dots: order.map((i, rank) => {
      const s = placed[i].s;
      fill[s] = (fill[s] ?? 0);
      const h = fill[s]++;
      return { s, h, rank };
    }) };
  }, [hist, majority]);
  const W = 640, R = 6;
  const lo = Math.min(...dots.map((d) => d.s)) - 2 * bin;
  const hi = Math.max(...dots.map((d) => d.s)) + 2 * bin;
  const maxH = Math.max(...dots.map((d) => d.h)) + 1;
  const cols = (hi - lo) / bin + 1;
  const colW = Math.min(16, (W - 56) / cols);
  const pad = (W - cols * colW) / 2;
  const r = Math.min(R, colW / 2 - 0.5);
  const H = Math.max(120, maxH * r * 2.2 + 48);
  const x = (s: number) => pad + ((s - lo) / bin + 0.5) * colW;
  const y = (h: number) => H - 30 - r - h * r * 2.2;
  const fillFor = (s: number) => { const p = partyAt(s); return p === "D" ? "var(--d-safe)" : p === "R" ? "var(--r-safe)" : "var(--tossup)"; };
  const ticks = [] as number[];
  const step = bin > 1 ? bin * 4 : hi - lo > 40 ? 10 : 5;
  for (let t = majority - Math.floor((majority - lo) / step) * step; t <= hi; t += step) ticks.push(t);
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: "block", maxWidth: W }}>
        {majority >= lo && majority <= hi && (
          <g>
            <line x1={x(majority) - colW / 2} x2={x(majority) - colW / 2} y1={8} y2={H - 26} stroke="var(--ink)" strokeDasharray="2 3" />
            <text x={x(majority) - colW / 2 + 4} y={18} fontSize={12} fill="var(--ink-muted)">{majority} for majority</text>
          </g>
        )}
        {dots.map((d, i) => (
          <motion.circle key={i} cx={x(d.s)} r={r} fill={fillFor(d.s)}
            initial={reduce ? false : { cy: -20, opacity: 0 }}
            animate={{ cy: y(d.h), opacity: 1 }}
            transition={reduce ? { duration: 0 } : { delay: d.rank * 0.011, duration: 0.45, ease: [0.3, 0.9, 0.4, 1] }} />
        ))}
        <line x1={pad} x2={W - pad} y1={H - 26} y2={H - 26} stroke="var(--line)" />
        {ticks.map((t) => <text key={t} x={x(t) - colW / 2} y={H - 10} fontSize={12} textAnchor="middle" fill="var(--ink-muted)">{t}</text>)}
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
