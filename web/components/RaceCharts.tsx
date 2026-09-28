"use client";
import { fmtDate } from "@/lib/format";
import type { RaceDetail } from "@/lib/types";
import LineChart from "./LineChart";
import { TipProvider } from "./Tooltip";

export default function PollChart({ race }: { race: RaceDetail }) {
  const trend = race.trend ?? [];
  const polls = race.polls ?? [];
  if (!trend.length) return <p className="muted">No polls of this matchup yet, so there is no polling average. The forecast relies on fundamentals.</p>;
  const ys = [...trend.flatMap((t) => [t.margin - 1.96 * t.se, t.margin + 1.96 * t.se]), ...polls.map((p) => p.adjusted)];
  const lim = Math.max(8, Math.ceil(Math.max(...ys.map(Math.abs)) / 4) * 4 + 2);
  const d = race.dside.name ?? "D", r = race.rside.name ?? "R";
  const col = (m: number) => (m >= 0 ? (race.dside.party === "D" ? "var(--dem)" : "var(--ind)") : race.rside.party === "R" ? "var(--rep)" : "var(--ind)");
  const last = trend[trend.length - 1];
  return (
    <TipProvider>
      <LineChart title={`Polling average for ${race.title}`} yDomain={[-lim, lim]} height={300}
        yFormat={(n) => (Math.abs(n) < 0.05 ? "Even" : `${n > 0 ? d.split(" ").slice(-1)[0] : r.split(" ").slice(-1)[0]} +${Math.abs(n).toFixed(0)}`)}
        zeroLine={{ y: 0 }} xDomain={[trend[0].date, last.date]}
        series={[{ key: "avg", label: "Average", color: col(last.margin), values: trend.map((t) => ({ date: t.date, y: t.margin, lo: t.margin - 1.96 * t.se, hi: t.margin + 1.96 * t.se })) }]}
        dots={polls.filter((p) => p.end >= trend[0].date).map((p) => ({ date: p.end, y: p.adjusted, color: col(p.adjusted), tip: `${p.pollster} ${fmtDate(p.end)}` }))} />
      <p className="small muted">Line: weighted average after adjustments; band: 95% range of the average; dots: individual polls after adjustments.</p>
    </TipProvider>
  );
}
