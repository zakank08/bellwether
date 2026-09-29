"use client";
import { scaleLinear, scaleTime } from "d3-scale";
import { area, line, curveMonotoneX } from "d3-shape";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { fmtDate } from "@/lib/format";

export type Series = { key: string; color: string; values: { date: string; y: number; lo?: number; hi?: number }[]; label: string };
export type Dot = { date: string; y: number; color: string; r?: number; tip: React.ReactNode };

/** Shared line chart: trend lines draw in, dots fade in with a stagger, a
 * crosshair tooltip follows the pointer. Used for polls and odds over time. */
export default function LineChart({ series, dots = [], yDomain, yFormat, height = 280, zeroLine, title, xDomain }: {
  series: Series[]; dots?: Dot[]; yDomain: [number, number]; yFormat: (n: number) => string; height?: number;
  zeroLine?: { y: number; label?: string }; title: string; xDomain?: [string, string];
}) {
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -40px 0px" }) || !!reduce;
  const W = 720, H = height, m = { t: 12, r: 96, b: 28, l: 12 };
  const all = [...series.flatMap((s) => s.values.map((v) => v.date)), ...dots.map((d) => d.date)];
  const dmin = xDomain?.[0] ?? all.reduce((a, b) => (a < b ? a : b), all[0]);
  const dmax = xDomain?.[1] ?? all.reduce((a, b) => (a > b ? a : b), all[0]);
  const x = useMemo(() => scaleTime().domain([new Date(dmin), new Date(dmax)]).range([m.l, W - m.r]), [dmin, dmax]);
  const y = useMemo(() => scaleLinear().domain(yDomain).range([H - m.b, m.t]).nice(), [yDomain, H]);
  const ln = line<{ date: string; y: number }>().x((d) => x(new Date(d.date))).y((d) => y(d.y)).curve(curveMonotoneX);
  const ar = area<{ date: string; lo?: number; hi?: number }>().x((d) => x(new Date(d.date))).y0((d) => y(d.lo ?? 0)).y1((d) => y(d.hi ?? 0)).curve(curveMonotoneX);
  const ticks = x.ticks(W > 600 ? 6 : 4);
  const yt = y.ticks(5);
  const base = series[0]?.values ?? [];
  const onMove = (e: React.PointerEvent) => {
    const svg = ref.current; if (!svg || !base.length) return;
    const pt = svg.getBoundingClientRect();
    const px = ((e.clientX - pt.left) / pt.width) * W;
    const t = x.invert(px).getTime();
    let best = 0, bd = Infinity;
    base.forEach((v, i) => { const dd = Math.abs(new Date(v.date).getTime() - t); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };
  const hv = hover != null ? base[hover] : null;
  return (
    <div style={{ position: "relative" }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title} style={{ display: "block", touchAction: "pan-y" }}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {yt.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={W - m.r + 6} y={y(t) + 4} fontSize={12} fill="var(--ink-muted)">{yFormat(t)}</text>
          </g>
        ))}
        {zeroLine && <line x1={m.l} x2={W - m.r} y1={y(zeroLine.y)} y2={y(zeroLine.y)} stroke="var(--ink-muted)" strokeWidth={1} />}
        {ticks.map((t) => <text key={+t} x={x(t)} y={H - 8} fontSize={12} textAnchor="middle" fill="var(--ink-muted)">{fmtDate(t.toISOString().slice(0, 10))}</text>)}
        {series.map((s) => s.values.some((v) => v.lo != null) && (
          <motion.path key={s.key + "band"} d={ar(s.values) ?? ""} fill={s.color} initial={{ opacity: 0 }} animate={{ opacity: seen ? 0.14 : 0 }} transition={{ duration: reduce ? 0 : 0.6 }} />
        ))}
        {dots.map((d, i) => (
          <motion.circle key={i} cx={x(new Date(d.date))} cy={y(Math.max(yDomain[0], Math.min(yDomain[1], d.y)))} r={d.r ?? 3.5}
            fill={d.color} fillOpacity={0.35} stroke={d.color} strokeWidth={1}
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: seen ? 1 : 0 }} transition={{ delay: reduce ? 0 : 0.3 + i * 0.012, duration: 0.3 }} />
        ))}
        {series.map((s) => (
          <motion.path key={s.key} d={ln(s.values) ?? ""} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: seen ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.8, ease: "easeOut" }} />
        ))}
        {hv && (
          <g pointerEvents="none">
            <line x1={x(new Date(hv.date))} x2={x(new Date(hv.date))} y1={m.t} y2={H - m.b} stroke="var(--ink-muted)" strokeDasharray="2 3" />
            {series.map((s) => { const v = s.values[hover!]; return v ? <circle key={s.key} cx={x(new Date(v.date))} cy={y(v.y)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null; })}
          </g>
        )}
      </svg>
      {hv && (
        <div className="tip" style={{ position: "absolute", left: `min(max(0px, ${(x(new Date(hv.date)) / W) * 100}% - 90px), calc(100% - 200px))`, top: 0, pointerEvents: "none" }}>
          <div className="small muted">{fmtDate(hv.date, { month: "short", day: "numeric", year: "numeric" })}</div>
          {series.map((s) => { const v = s.values[hover!]; return v ? <div key={s.key} className="num"><span style={{ color: s.color }}>●</span> {s.label}: <strong>{yFormat(v.y)}</strong></div> : null; })}
        </div>
      )}
    </div>
  );
}
