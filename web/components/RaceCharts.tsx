"use client";
import { fmtDate, in100, surname } from "@/lib/format";
import type { RaceDetail } from "@/lib/types";
import TimeChart from "./TimeChart";
import { TipProvider } from "./Tooltip";

const lastName = (s: string | null) => surname(s);
const sideInk = (p: string | null) => (p === "D" ? "var(--dem)" : p === "R" ? "var(--rep)" : "var(--ind)");

export default function PollChart({ race }: { race: RaceDetail }) {
  const trend = race.trend ?? [];
  const polls = race.polls ?? [];
  if (!trend.length) return <p className="muted">No polls of this matchup yet, so there is no polling average. The forecast relies on fundamentals.</p>;
  const d = lastName(race.dside.name) || "D", r = lastName(race.rside.name) || "R";
  const col = (m: number) => (m >= 0 ? sideInk(race.dside.party) : sideInk(race.rside.party));
  const last = trend[trend.length - 1];
  return (
    <TipProvider>
      <TimeChart title={`Polling average for ${race.title}`} height={300} defaultRange="6M" autoY={{ symmetric: true, minSpan: 16, pad: 0.05 }}
        yFormat={(n) => (Math.abs(n) < 0.05 ? "Even" : `${n > 0 ? d : r} +${Math.abs(n).toFixed(0)}`)} zeroLine={{ y: 0 }}
        deltaFormat={(x) => Math.abs(x) < 0.1 ? { text: "No change", color: "var(--ink-muted)" } : { text: `${x > 0 ? d : r} +${Math.abs(x).toFixed(1)}`, color: col(x) }}
        series={[{ key: "avg", label: "Average", color: col(last.margin), values: trend.map((t) => ({ date: t.date, y: t.margin, lo: t.margin - 1.96 * t.se, hi: t.margin + 1.96 * t.se })) }]}
        dots={polls.map((p) => ({ date: p.end, y: p.adjusted, color: col(p.adjusted), tip: `${p.pollster} ${fmtDate(p.end)}` }))} />
      <p className="small muted">Line: weighted average after adjustments; band: 95% range of the average; dots: individual polls after adjustments.</p>
    </TipProvider>
  );
}

export function OddsChart({ race }: { race: RaceDetail }) {
  const t = race.odds_trend ?? [];
  if (t.length < 2) return <p className="muted">The chance-over-time chart appears after a couple of daily updates.</p>;
  const dn = race.dside.name ?? "D-side", rn = race.rside.name ?? "R-side";
  return (
    <TipProvider>
      <TimeChart title={`Chance of winning over time, ${race.title}`} yDomain={[0, 100]} yFormat={(n) => `${Math.round(n)}`} height={240}
        zeroLine={{ y: 50 }} defaultRange="3M"
        deltaFormat={(x) => Math.abs(x) < 0.5 ? { text: "No change", color: "var(--ink-muted)" } : { text: `${lastName(x > 0 ? dn : rn)} +${Math.abs(x).toFixed(0)}`, color: x > 0 ? sideInk(race.dside.party) : sideInk(race.rside.party) }}
        series={[
          { key: "d", label: dn, color: sideInk(race.dside.party), values: t.map((p) => ({ date: p.date, y: p.p * 100 })) },
          { key: "r", label: rn, color: sideInk(race.rside.party), values: t.map((p) => ({ date: p.date, y: (1 - p.p) * 100 })) },
        ]} />
      <p className="small muted">Out of 100. Today: {lastName(dn)} {in100(t[t.length - 1].p)}, {lastName(rn)} {in100(1 - t[t.length - 1].p)}.</p>
    </TipProvider>
  );
}
