"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { candidateVotes, clock, partyOf, type Snap } from "@/lib/demo";
import { surname } from "@/lib/format";
import CountyMap from "@/components/CountyMap";
import { useLive } from "@/components/useLive";
import { useTip } from "@/components/Tooltip";
import { Defs, fillFor, flipOfSnap, TipBody } from "./DemoMaps";
import { Detail, FeedChip, Status } from "./ElectionNightDemo";

type CountyGeo = { w: number; h: number; source: string; counties: { fips: string; name: string; d: string; v: [number, number, number] | null }[] };
type DistrictGeo = { w: number; h: number; source: string; districts: { id: string; d: string }[] };
const cache = new Map<string, Promise<unknown>>();
function load<T>(url: string): Promise<T | null> {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return cache.get(url) as Promise<T | null>;
}
function useGeo<T>(url: string | null): { data: T | null; done: boolean } {
  const [s, set] = useState<{ url: string | null; data: T | null; done: boolean }>({ url: null, data: null, done: false });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    load<T>(url).then((d) => { if (alive) set({ url, data: d, done: true }); });
    return () => { alive = false; };
  }, [url]);
  return s.url === url ? { data: s.data, done: s.done } : { data: null, done: false };
}

export type DrillTab = "s" | "g" | "h";
const TAB_LABEL: Record<DrillTab, string> = { s: "Senate", g: "Governor", h: "House" };
const norm = (s: string) => s.toLowerCase().replace(/\bcounty\b|\bparish\b|[^a-z0-9]/g, "");

/** What you see after clicking a state: its Senate or governor race by county, or its House districts by outline, with the numbers beside it. */
export default function StateDrill({ st, stateName, tab, setTab, snaps, selId, setSelId, hist, tm, preP, onBack }: {
  st: string; stateName: string; tab: DrillTab; setTab: (t: DrillTab) => void; snaps: Snap[]; selId: string | null; setSelId: (id: string) => void;
  hist: Map<string, { t: number; p: number }[]>; tm: number; preP: (r: { mu0: number; sd0: number }) => number; onBack: () => void;
}) {
  const mine = useMemo(() => snaps.filter((s) => s.row.st === st), [snaps, st]);
  const tabs = (["s", "g", "h"] as const).filter((t) => mine.some((s) => s.row.o === t));
  const active: DrillTab = tabs.includes(tab) ? tab : tabs[0] ?? "s";
  const races = mine.filter((s) => s.row.o === active).sort((a, b) => a.row.id.localeCompare(b.row.id));
  const sel = races.find((s) => s.row.id === selId) ?? races[0] ?? null;
  const { results } = useLive();
  const liveRow = sel ? results?.races.find((r) => r.race_id === sel.row.id) : undefined;

  const county = useGeo<CountyGeo>(active !== "h" ? `/data/counties/${st}.json` : null);
  const hasDistrictFile = active === "h" && races.length > 1;
  const dist = useGeo<DistrictGeo>(hasDistrictFile ? `/data/districts/${st}.json` : null);

  const countyRows = useMemo(() => {
    if (!liveRow?.counties) return [];
    return Object.entries(liveRow.counties).map(([name, v]) => ({ name, d: v[0], r: v[1], o: v[2], t: v[0] + v[1] + v[2] })).filter((c) => c.t > 0).sort((a, b) => b.t - a.t);
  }, [liveRow]);
  const [allCounties, setAllCounties] = useState(false);
  void norm;

  return (
    <div className="drill">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div className="row" style={{ gap: 12, alignItems: "baseline" }}>
          <button className="btn" onClick={onBack}>← All states</button>
          <h2 className="display" style={{ margin: 0 }}>{stateName}</h2>
        </div>
        <div className="toggle" role="group" aria-label="Which race">
          {tabs.map((t) => <button key={t} aria-pressed={active === t} onClick={() => { setTab(t); const first = mine.find((s) => s.row.o === t); if (first) setSelId(first.row.id); }}>{TAB_LABEL[t]}{t === "h" ? ` (${mine.filter((s) => s.row.o === "h").length})` : ""}</button>)}
        </div>
      </div>
      {mine[0] && <p className="small muted" style={{ margin: "6px 0 0" }}>Polls close {clock(mine[0].row.openAt)} ET. {active === "h" ? "Each outline is a 2026 congressional district." : "Counties are colored by who leads the count there."}</p>}

      {active !== "h" && races.length > 1 && (
        <div className="demo-chips" style={{ marginTop: 10 }}>{races.map((s) => <button key={s.row.id} className={`demo-mini${sel?.row.id === s.row.id ? " on" : ""}`} onClick={() => setSelId(s.row.id)}>{s.row.title}</button>)}</div>
      )}

      <div className="nm-layout" style={{ marginTop: 12 }}>
        <div>
          {active !== "h" && (county.data
            ? <CountyMap shapes={county.data.counties} w={county.data.w} h={county.data.h} base={Object.fromEntries(county.data.counties.filter((c) => c.v).map((c) => [c.fips, c.v!]))} raceId={sel?.row.id} stateName={stateName} />
            : <p className="muted">{county.done ? `County outlines aren’t shown for ${stateName}: ${st === "AK" ? "Alaska reports by state House district, not by county." : st === "CT" ? "Connecticut reports by town." : "no county shapes available."}` : "Loading the county map…"}</p>)}
          {active === "h" && (dist.data
            ? <DistrictMap geo={dist.data} snaps={races} selId={sel?.row.id ?? null} onPick={setSelId} />
            : <p className="muted">{races.length === 1 ? `${stateName} has one district for the whole state, so the statewide numbers are the district’s.` : dist.done ? "District outlines aren’t available for this state." : "Loading the district map…"}</p>)}
          {active !== "h" && county.data && !liveRow?.counties && sel && (
            <p className="small muted" style={{ marginTop: 6 }}>The colors show the 2024 presidential result for context. County-by-county counts for this race appear here once {stateName}’s official site publishes them.</p>
          )}
        </div>
        <div>{sel ? <Detail s={sel} t={tm} series={(hist.get(sel.row.id) ?? []).length > 1 ? hist.get(sel.row.id)! : []} onPick={setSelId} stateSnaps={[]} preP={preP(sel.row)} /> : <div className="demo-panel"><p className="muted" style={{ margin: 0 }}>No {TAB_LABEL[active].toLowerCase()} race here.</p></div>}</div>
      </div>

      {countyRows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 6px" }}>Results by county</h3>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>County</th><th className="r">Democratic side</th><th className="r">Republican side</th><th className="r">Votes counted</th></tr></thead>
            <tbody>{countyRows.slice(0, allCounties ? 500 : 12).map((c) => (
              <tr key={c.name}><td>{c.name}</td><td className="r num">{((c.d / c.t) * 100).toFixed(1)}%</td><td className="r num">{((c.r / c.t) * 100).toFixed(1)}%</td><td className="r num">{c.t.toLocaleString("en-US")}</td></tr>
            ))}</tbody>
          </table></div>
          {countyRows.length > 12 && <button className="btn" style={{ marginTop: 8 }} onClick={() => setAllCounties((v) => !v)}>{allCounties ? "Show fewer" : `Show all ${countyRows.length} counties`}</button>}
        </div>
      )}

      {active === "h" && races.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 6px" }}>{stateName} House districts</h3>
          <div className="table-wrap"><table className="data cards">
            <thead><tr><th>District</th><th>Democratic side</th><th>Republican side</th><th className="r">In</th><th>Status</th></tr></thead>
            <tbody>{races.map((s) => {
              const v = candidateVotes(s), win = s.decision.winner;
              return (
                <tr key={s.row.id} className={flipOfSnap(s) ? "flip" : undefined} onClick={() => setSelId(s.row.id)} style={{ cursor: "pointer", background: sel?.row.id === s.row.id ? "var(--uncalled)" : undefined }}>
                  <td data-label="District"><Link href={`/race/${s.row.id}/`}><strong>{s.row.title.replace(`${stateName} `, "")}</strong></Link></td>
                  <td data-label="Democratic side">{win === "dside" ? "✓ " : ""}{surname(s.row.dn)} {s.margin != null && <strong className="num">{v.dPct.toFixed(1)}%</strong>}</td>
                  <td data-label="Republican side">{win === "rside" ? "✓ " : ""}{surname(s.row.rn)} {s.margin != null && <strong className="num">{v.rPct.toFixed(1)}%</strong>}</td>
                  <td data-label="In" className="r num">{s.units > 0 ? `${Math.round(Math.min(s.units, 0.99) * 100)}%` : "—"}</td>
                  <td data-label="Status"><span className="row" style={{ gap: 6 }}><FeedChip s={s} t={tm} /><Status s={s} /></span></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

function DistrictMap({ geo, snaps, selId, onPick }: { geo: DistrictGeo; snaps: Snap[]; selId: string | null; onPick: (id: string) => void }) {
  const { show, hide } = useTip();
  const byId = useMemo(() => new Map(snaps.map((s) => [s.row.id, s])), [snaps]);
  return (
    <svg viewBox={`0 0 ${geo.w} ${geo.h}`} width="100%" role="img" aria-label="Map of this state’s congressional districts, colored by how counting is going" style={{ display: "block", maxHeight: 520 }}>
      <Defs />
      {geo.districts.map((d) => {
        const s = byId.get(d.id);
        if (!s) return <path key={d.id} d={d.d} fill="var(--uncalled)" stroke="var(--surface)" strokeWidth={0.8} />;
        const sel = selId === d.id, flip = flipOfSnap(s);
        return (
          <path key={d.id} d={d.d} style={{ fill: fillFor(s), cursor: "pointer", transition: "fill .35s" }} stroke="var(--surface)" strokeWidth={0.9} strokeLinejoin="round"
            tabIndex={0} role="button" aria-label={`${s.row.title}: ${s.decision.why}`}
            onMouseMove={(e) => show(e, <TipBody s={s} />)} onMouseLeave={hide} onClick={() => onPick(d.id)} onKeyDown={(e) => { if (e.key === "Enter") onPick(d.id); }} />
        );
      })}
      {geo.districts.map((d) => {
        const s = byId.get(d.id);
        if (!s) return null;
        const sel = selId === d.id, flip = flipOfSnap(s);
        return (sel || flip) ? <path key={"o" + d.id} d={d.d} fill="none" stroke={sel ? "var(--ink)" : "var(--flip)"} strokeWidth={sel ? 3 : 2.6} strokeLinejoin="round" pointerEvents="none" /> : null;
      })}
    </svg>
  );
}
void partyOf;
