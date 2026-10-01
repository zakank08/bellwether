"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BUCKET_LABEL, bucketVar, in100, onBucket, surname } from "@/lib/format";
import type { RaceDetail, Version } from "@/lib/types";

type Idx = { id: string; title: string; office: string; state: string };
const OFFICE: Record<string, string> = { senate: "Senate", house: "House", governor: "Governor" };
const usd = (n: number | null | undefined) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3).toLocaleString("en-US")}K`);
const lean = (x: number | null | undefined) => (x == null ? "—" : x === 0 ? "Even" : x > 0 ? `D+${x.toFixed(0)}` : `R+${(-x).toFixed(0)}`);
const ml = (r: RaceDetail, x: number | null | undefined) => (x == null ? "—" : `${surname(x >= 0 ? r.dside.name : r.rside.name)} +${Math.abs(x).toFixed(1)}`);

function useRace(id: string | null) {
  const [r, setR] = useState<RaceDetail | null>(null);
  useEffect(() => {
    setR(null);
    if (!id) return;
    let alive = true;
    fetch(`/data/race/${id}.json`).then((x) => x.json()).then((j) => alive && setR(j)).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  return r;
}

function Picker({ label, value, onChange, races }: { label: string; value: string | null; onChange: (id: string) => void; races: Idx[] }) {
  const groups = (["senate", "governor", "house"] as const).map((o) => [o, races.filter((r) => r.office === o)] as const);
  return (
    <label style={{ flex: "1 1 260px" }}>
      <span className="kicker">{label}</span><br />
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", minHeight: 40, font: "inherit", padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--line)", background: "var(--surface-raised)", color: "var(--ink)" }}>
        <option value="">Choose a race…</option>
        {groups.map(([o, rs]) => <optgroup key={o} label={OFFICE[o]}>{rs.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</optgroup>)}
      </select>
    </label>
  );
}

/** Two lines on one chart: each race's chance for its non-Republican side over time. Line style (solid vs dashed) tells the races apart, not party color. */
function TrendOverlay({ a, b }: { a: RaceDetail; b: RaceDetail }) {
  const sa = a.odds_trend ?? [], sb = b.odds_trend ?? [];
  if (sa.length < 2 && sb.length < 2) return null;
  const all = [...sa, ...sb].map((x) => x.date).sort();
  const t0 = new Date(all[0]).getTime(), t1 = new Date(all[all.length - 1]).getTime() || t0 + 1;
  const W = 600, H = 214, X = (d: string) => 36 + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 48), Y = (p: number) => 10 + (1 - p) * (H - 44);
  const line = (s: { date: string; p: number }[]) => s.map((x, i) => `${i ? "L" : "M"}${X(x.date).toFixed(1)} ${Y(x.p).toFixed(1)}`).join("");
  return (
    <figure style={{ margin: "8px 0 0" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chance of winning over time: ${a.title} (solid) and ${b.title} (dashed)`} style={{ width: "100%", height: "auto" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => <g key={g}><line x1={36} x2={W - 12} y1={Y(g)} y2={Y(g)} stroke="var(--line)" /><text x={30} y={Y(g) + 4} textAnchor="end" fontSize="11" fill="var(--ink-muted)">{g * 100}</text></g>)}
        <text x={36} y={H - 2} fontSize="11" fill="var(--ink-muted)">{new Date(all[0] + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</text>
        <text x={W - 12} y={H - 2} textAnchor="end" fontSize="11" fill="var(--ink-muted)">{new Date(all[all.length - 1] + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</text>
        <path d={line(sa)} fill="none" stroke="var(--ink)" strokeWidth={2.2} />
        <path d={line(sb)} fill="none" stroke="var(--ink)" strokeWidth={2.2} strokeDasharray="6 4" />
      </svg>
      <figcaption className="small muted">Chance for each race’s non-Republican side, out of 100. Solid line: {a.title}. Dashed line: {b.title}.</figcaption>
    </figure>
  );
}

export default function Compare({ races, starts, version }: { races: Idx[]; starts: string[]; version: Version }) {
  const router = useRouter(), sp = useSearchParams();
  const ids = useMemo(() => new Set(races.map((r) => r.id)), [races]);
  const ok = (x: string | null) => (x && ids.has(x) ? x : null);
  const a = ok(sp.get("a")), b = ok(sp.get("b"));
  const ra = useRace(a), rb = useRace(b);
  const set = (k: "a" | "b", v: string) => { const q = new URLSearchParams(sp.toString()); if (v) q.set(k, v); else q.delete(k); router.replace(`/compare/?${q.toString()}`, { scroll: false }); };
  const byId = Object.fromEntries(races.map((r) => [r.id, r]));

  const rows: [string, (r: RaceDetail) => React.ReactNode][] = [
    ["Rating", (r) => <span className="chip" style={{ background: bucketVar(r.rating[version]), color: onBucket(r.rating[version]) }}>{BUCKET_LABEL[r.rating[version]]}</span>],
    ["Chance of winning", (r) => r.kind === "two_party" ? <>{surname(r.dside.name)} <strong className="num">{in100(r.p[version])}</strong> · {surname(r.rside.name)} <strong className="num">{in100(1 - r.p[version])}</strong> in 100</> : "Not contested"],
    ["Projected margin", (r) => ml(r, r.margin[version])],
    ["Likely range (80 in 100)", (r) => r.interval?.p10 != null && r.interval.p90 != null ? `${ml(r, r.interval.p10)} to ${ml(r, r.interval.p90)}` : "—"],
    ["Polling average", (r) => (r.n_polls ? `${ml(r, r.poll_avg)} (${r.n_polls} poll${r.n_polls === 1 ? "" : "s"})` : "No polls yet")],
    ["Partisan lean", (r) => lean(r.pvi)],
    ["Incumbent", (r) => (r.open ? "Open seat" : r.incumbent ? `${r.incumbent} (${r.incumbent_party})` : "—")],
    ["Raised (through latest filing)", (r) => (r.money ? `${surname(r.dside.name)} ${usd(r.money.d?.receipts)} · ${surname(r.rside.name)} ${usd(r.money.r?.receipts)}` : "—")],
    ["Cash on hand", (r) => (r.money ? `${surname(r.dside.name)} ${usd(r.money.d?.cash_on_hand)} · ${surname(r.rside.name)} ${usd(r.money.r?.cash_on_hand)}` : "—")],
  ];

  return (
    <>
      <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 20 }}>
        <Picker label="Race A" value={a} onChange={(v) => set("a", v)} races={races} />
        <Picker label="Race B" value={b} onChange={(v) => set("b", v)} races={races} />
      </div>
      {!a && !b && (
        <p className="muted">Not sure where to start? Try two of the closest statewide races:{" "}
          {starts.slice(0, 2).length === 2 && <Link href={`/compare/?a=${starts[0]}&b=${starts[1]}`}>{byId[starts[0]].title} vs. {byId[starts[1]].title}</Link>}</p>
      )}
      {a && b && !(ra && rb) && <p className="muted" aria-live="polite">Loading…</p>}
      {ra && rb && (
        <>
          <div className="table-wrap">
            <table className="data compare">
              <caption className="sr-only">{ra.title} compared with {rb.title}</caption>
              <thead><tr><th></th><th><Link href={`/race/${ra.id}/`}>{ra.title}</Link><div className="small muted">{OFFICE[ra.office]}</div></th><th><Link href={`/race/${rb.id}/`}>{rb.title}</Link><div className="small muted">{OFFICE[rb.office]}</div></th></tr></thead>
              <tbody>{rows.map(([k, f]) => <tr key={k}><th scope="row" className="small muted" style={{ fontWeight: 500 }}>{k}</th><td>{f(ra)}</td><td>{f(rb)}</td></tr>)}</tbody>
            </table>
          </div>
          <TrendOverlay a={ra} b={rb} />
        </>
      )}
      {(a && !b) || (!a && b) ? <p className="muted">Choose a second race to compare.</p> : null}
    </>
  );
}
