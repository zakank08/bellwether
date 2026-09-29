"use client";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";

/** Half-circle odds gauge. The needle swings to the D-side's win chance. */
export function Gauge({ p, dColor, rColor, label }: { p: number; dColor: string; rColor: string; label: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { once: true }) || !!reduce;
  const mv = useMotionValue(0.5);
  useEffect(() => {
    if (!seen) return;
    if (reduce) { mv.set(p); return; }
    const c = animate(mv, p, { type: "spring", stiffness: 60, damping: 12, mass: 1 });
    return () => c.stop();
  }, [p, seen, reduce, mv]);
  // Needle angle: D-side's chance 1 -> points left (the D side), 0 -> right.
  const needle = useTransform(mv, (v) => {
    const a = Math.PI * v, px = Math.cos(a + Math.PI / 2) * 0.035, py = -Math.sin(a + Math.PI / 2) * 0.035;
    return `M${px},${py} L${Math.cos(a) * 0.8},${-Math.sin(a) * 0.8} L${-px},${-py} Z`;
  });
  const arc = (from: number, to: number, r: number) => {
    const a0 = Math.PI * (1 - from), a1 = Math.PI * (1 - to);
    return `M${Math.cos(a0) * r},${-Math.sin(a0) * r} A${r},${r} 0 0 1 ${Math.cos(a1) * r},${-Math.sin(a1) * r}`;
  };
  return (
    <svg ref={ref} viewBox="-1.15 -1.12 2.3 1.3" width={220} role="img" aria-label={label} style={{ display: "block", overflow: "visible" }}>
      {/* Track: D side on the left, R side on the right; the colored sweep runs from 50-50 to the needle. */}
      <path d={arc(0, 0.5, 1)} fill="none" stroke={dColor} strokeOpacity={0.22} strokeWidth={0.16} />
      <path d={arc(0.5, 1, 1)} fill="none" stroke={rColor} strokeOpacity={0.22} strokeWidth={0.16} />
      <path d={p >= 0.5 ? arc(1 - p, 0.5, 1) : arc(0.5, 1 - p, 1)} fill="none" stroke={p >= 0.5 ? dColor : rColor} strokeWidth={0.16} />
      {[0.25, 0.5, 0.75].map((t) => {
        const a = Math.PI * (1 - t);
        return <line key={t} x1={Math.cos(a) * 0.86} y1={-Math.sin(a) * 0.86} x2={Math.cos(a) * 1.1} y2={-Math.sin(a) * 1.1} stroke="var(--surface)" strokeWidth={0.02} />;
      })}
      <motion.path d={needle} fill="var(--ink)" />
      <circle r={0.07} fill="var(--ink)" />
      <text x={0} y={0.17} textAnchor="middle" fontSize={0.1} fill="var(--ink-muted)">50–50</text>
    </svg>
  );
}

/** Where the margin lands across all simulations, 2-point bins. */
export function OutcomeDist({ dist, dName, rName, dColor, rColor, median }: { dist: number[]; dName: string; rName: string; dColor: string; rColor: string; median: number | null }) {
  const reduce = useReducedMotion();
  const ref = useRef<SVGSVGElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -40px 0px" }) || !!reduce;
  const W = 720, H = 160, bw = W / dist.length, max = Math.max(...dist, 1e-9);
  const x0 = W / 2;
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H + 26}`} width="100%" role="img" aria-label={`Distribution of simulated margins between ${dName} and ${rName}`} style={{ display: "block" }}>
      {dist.map((v, i) => {
        const h = (v / max) * H, mid = -40 + i * 2 + 1;
        return <motion.rect key={i} x={i * bw + 1} width={bw - 2} rx={1.5} fill={mid > 0 ? dColor : rColor} fillOpacity={0.85}
          initial={reduce ? false : { y: H, height: 0 }} animate={seen ? { y: H - h, height: h } : { y: H, height: 0 }}
          transition={reduce ? { duration: 0 } : { delay: Math.abs(i - dist.length / 2) * 0.018, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }} />;
      })}
      <line x1={x0} x2={x0} y1={0} y2={H} stroke="var(--ink)" strokeWidth={1.5} />
      {median != null && <line x1={x0 + (median / 40) * (W / 2)} x2={x0 + (median / 40) * (W / 2)} y1={0} y2={H} stroke="var(--ink)" strokeDasharray="3 3" />}
      {[-30, -20, -10, 10, 20, 30].map((t) => <text key={t} x={x0 + (t / 40) * (W / 2)} y={H + 18} fontSize={12} textAnchor="middle" fill="var(--ink-muted)">{t < 0 ? `${rName} +${-t}` : `${dName} +${t}`}</text>)}
      <text x={x0} y={H + 18} fontSize={12} textAnchor="middle" fill="var(--ink)" fontWeight={600}>Tie</text>
    </svg>
  );
}
