import { surname } from "@/lib/format";
/** Tiny trend line of a race's odds (D-side chance, 0–1). Pure SVG, no JS. */
export default function Sparkline({ values, dParty, rParty, w = 72, h = 22, label }: { values: number[]; dParty: string | null; rParty: string | null; w?: number; h?: number; label?: string }) {
  if (values.length < 2) return null;
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => 2 + (1 - v) * (h - 4);
  const last = values[values.length - 1];
  const color = last >= 0.5 ? (dParty === "D" ? "var(--dem)" : "var(--ind)") : rParty === "R" ? "var(--rep)" : "var(--ind)";
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label ?? `Trend over the last ${values.length} days`}>
      <line x1={2} x2={w - 2} y1={y(0.5)} y2={y(0.5)} stroke="var(--line)" strokeDasharray="2 2" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} fill={color} />
    </svg>
  );
}

/** Change in a race's odds, credited to whichever side gained. */
export function Delta({ from, to, dName, rName, dParty, rParty }: { from: number; to: number; dName?: string | null; rName?: string | null; dParty?: string | null; rParty?: string | null }) {
  const d = Math.round((to - from) * 100);
  if (d === 0) return <span className="small muted num">no change</span>;
  const gainer = d > 0 ? dName : rName;
  const party = d > 0 ? dParty : rParty;
  const color = party === "D" ? "var(--dem)" : party === "R" ? "var(--rep)" : "var(--ind)";
  const last = surname(gainer);
  return <span className="small num" style={{ color }} title={`${gainer} gained ${Math.abs(d)} points of win probability`}>▲ {last} +{Math.abs(d)}</span>;
}
