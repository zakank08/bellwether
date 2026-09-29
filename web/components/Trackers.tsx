"use client";
import { fmtDate, partyMarginLabel } from "@/lib/format";
import TimeChart from "./TimeChart";
import { TipProvider } from "./Tooltip";

type T = { date: string; margin: number; se: number };
export function GenericTracker({ trend, polls }: { trend: T[]; polls: { pollster: string; end: string; adjusted: number }[] }) {
  return (
    <TipProvider>
      <TimeChart title="Generic congressional ballot average" autoY={{ includeZero: true, minSpan: 8 }} yFormat={(n) => partyMarginLabel(n)} zeroLine={{ y: 0 }} height={300} defaultRange="6M"
        deltaFormat={(d) => Math.abs(d) < 0.1 ? { text: "No change", color: "var(--ink-muted)" } : { text: `${d > 0 ? "D" : "R"} +${Math.abs(d).toFixed(1)}`, color: d > 0 ? "var(--dem)" : "var(--rep)" }}
        series={[{ key: "g", label: "Average", color: "var(--dem)", values: trend.map((t) => ({ date: t.date, y: t.margin, lo: t.margin - 1.96 * t.se, hi: t.margin + 1.96 * t.se })) }]}
        dots={polls.map((p) => ({ date: p.end, y: p.adjusted, color: p.adjusted >= 0 ? "var(--dem)" : "var(--rep)", r: 2.5, tip: `${p.pollster} ${fmtDate(p.end)}` }))} />
    </TipProvider>
  );
}
export function ApprovalTracker({ trend, polls }: { trend: T[]; polls: { pollster: string; end: string; approve: number; disapprove: number }[] }) {
  return (
    <TipProvider>
      <TimeChart title="Presidential net approval average" autoY={{ includeZero: true, minSpan: 10 }} yFormat={(n) => `${n > 0 ? "+" : ""}${Math.round(n)}`} zeroLine={{ y: 0 }} height={300} defaultRange="1Y"
        deltaFormat={(d) => Math.abs(d) < 0.1 ? { text: "No change", color: "var(--ink-muted)" } : { text: `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts`, color: "var(--ink)" }}
        series={[{ key: "a", label: "Net approval", color: "var(--ink)", values: trend.map((t) => ({ date: t.date, y: t.margin, lo: t.margin - 1.96 * t.se, hi: t.margin + 1.96 * t.se })) }]}
        dots={polls.filter((p) => p.approve != null).map((p) => ({ date: p.end, y: p.approve - p.disapprove, color: "var(--ink-muted)", r: 2, tip: p.pollster }))} />
    </TipProvider>
  );
}
