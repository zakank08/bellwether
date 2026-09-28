"use client";
import { fmtDate, partyMarginLabel } from "@/lib/format";
import LineChart from "./LineChart";
import { TipProvider } from "./Tooltip";

type T = { date: string; margin: number; se: number };
export function GenericTracker({ trend, polls }: { trend: T[]; polls: { pollster: string; end: string; adjusted: number }[] }) {
  const start = trend[0]?.date;
  return (
    <TipProvider>
      <LineChart title="Generic congressional ballot average" yDomain={[-4, 14]} yFormat={(n) => partyMarginLabel(n)} zeroLine={{ y: 0 }} height={300}
        series={[{ key: "g", label: "Average", color: "var(--dem)", values: trend.map((t) => ({ date: t.date, y: t.margin, lo: t.margin - 1.96 * t.se, hi: t.margin + 1.96 * t.se })) }]}
        dots={polls.filter((p) => p.end >= start).map((p) => ({ date: p.end, y: p.adjusted, color: p.adjusted >= 0 ? "var(--dem)" : "var(--rep)", r: 2.5, tip: `${p.pollster} ${fmtDate(p.end)}` }))} />
    </TipProvider>
  );
}
export function ApprovalTracker({ trend, polls }: { trend: T[]; polls: { pollster: string; end: string; approve: number; disapprove: number }[] }) {
  const start = trend[0]?.date;
  return (
    <TipProvider>
      <LineChart title="Presidential net approval average" yDomain={[-30, 5]} yFormat={(n) => `${n > 0 ? "+" : ""}${Math.round(n)}`} zeroLine={{ y: 0 }} height={300}
        series={[{ key: "a", label: "Net approval", color: "var(--ink)", values: trend.map((t) => ({ date: t.date, y: t.margin, lo: t.margin - 1.96 * t.se, hi: t.margin + 1.96 * t.se })) }]}
        dots={polls.filter((p) => p.end >= start && p.approve != null).map((p) => ({ date: p.end, y: p.approve - p.disapprove, color: "var(--ink-muted)", r: 2, tip: p.pollster }))} />
    </TipProvider>
  );
}
