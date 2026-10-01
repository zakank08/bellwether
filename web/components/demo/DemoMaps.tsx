"use client";
import { geoPath } from "d3-geo";
import { useMemo } from "react";
import { feature, mesh } from "topojson-client";
import us from "us-atlas/states-albers-10m.json";
import { candidateVotes, hexKey, mapStatus, partyOf, type Snap } from "@/lib/demo";
import { hexLayout, hexPath } from "@/lib/layout";
import { in100, surname } from "@/lib/format";
import { FIPS } from "@/lib/tiles";
import { useTip } from "@/components/Tooltip";

const path = geoPath();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = us as any;
const states = (feature(topo, topo.objects.states) as any).features as { id: string }[];
const borders = path(mesh(topo, topo.objects.states, (a: unknown, b: unknown) => a !== b) as any) ?? "";

/** Fill for a race right now. Colors: gray = polls not closed; hatched = closed, nothing in yet; light = leading;
 * solid = Decided; purple stripes = special rule (runoff, ranked-choice, all-party primary). */
export function fillFor(s: Snap | undefined): string {
  if (!s) return "var(--surface-raised)";
  const m = mapStatus(s);
  if (m === "closed") return "var(--uncalled)";
  if (m === "waiting") return "url(#nm-hatch)";
  if (m === "special") return "url(#nm-special)";
  if (m === "close") return "var(--tossup)";
  const side = m === "decided" ? s.decision.winner! : (s.margin ?? 0) >= 0 ? "dside" : "rside";
  const party = partyOf(s.row, side);
  const solid = m === "decided";
  if (party === "D") return solid ? "var(--d-safe)" : "var(--d-lean)";
  if (party === "R") return solid ? "var(--r-safe)" : "var(--r-lean)";
  return solid ? "var(--ind-fill)" : "var(--ind-fill)";
}

export const flipOfSnap = (s: Snap): boolean => {
  if (s.decision.state !== "decided" || !s.row.holder) return false;
  return partyOf(s.row, s.decision.winner!) !== s.row.holder;
};

export function TipBody({ s }: { s: Snap }) {
  const v = candidateVotes(s);
  const r = s.row;
  return (
    <>
      <strong>{r.title}</strong> · {r.o === "s" ? "Senate" : "House"}<br />
      {s.margin == null ? <span className="muted">{s.decision.why}</span> : (
        <>
          <span style={{ color: "var(--dem)" }}>{surname(r.dn)}</span> <strong className="num">{v.dPct.toFixed(1)}%</strong> · <span style={{ color: "var(--rep)" }}>{surname(r.rn)}</span> <strong className="num">{v.rPct.toFixed(1)}%</strong><br />
          <span className="small">≈{Math.round(Math.min(s.f, 0.99) * 100)}% of expected vote · {s.decision.state === "decided" ? "Decided ✓" : s.decision.state === "counting" ? "counting" : s.decision.why}</span><br />
          <span className="small muted">Live odds: {surname(r.dn)} {in100(s.p)} in 100</span>
        </>
      )}
    </>
  );
}

function Defs() {
  return (
    <defs>
      <pattern id="nm-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="var(--uncalled)" /><line x1="0" y1="0" x2="0" y2="7" stroke="var(--ink-muted)" strokeWidth="2" opacity=".45" />
      </pattern>
      <pattern id="nm-special" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect width="7" height="7" fill="var(--uncalled)" /><line x1="0" y1="0" x2="0" y2="7" stroke="var(--ind-fill)" strokeWidth="3" />
      </pattern>
    </defs>
  );
}

/** Senate: states colored by their Senate race. Click a state to open its races. */
export function DemoStateMap({ snaps, selState, onState }: { snaps: Snap[]; selState: string | null; onState: (st: string) => void }) {
  const { show, hide } = useTip();
  const byState = useMemo(() => {
    const m: Record<string, Snap[]> = {};
    for (const s of snaps) if (s.row.o === "s") (m[s.row.st] ??= []).push(s);
    return m;
  }, [snaps]);
  return (
    <svg viewBox="0 0 975 610" width="100%" role="img" aria-label="Map of the 2026 Senate races, colored by how counting is going" style={{ display: "block" }}>
      <Defs />
      {states.map((f) => {
        const st = FIPS[f.id];
        const its = byState[st];
        const main = its?.[0];
        return (
          <path key={f.id} d={path(f as any) ?? ""} style={{ fill: fillFor(main), cursor: its ? "pointer" : "default", transition: "fill .35s" }}
            tabIndex={its ? 0 : -1} role={its ? "button" : undefined} aria-label={its ? its.map((i) => `${i.row.title}: ${i.decision.why}`).join("; ") : `${st}: no Senate race`}
            onMouseMove={its ? (e) => show(e, <>{its.map((i) => <div key={i.row.id} style={{ marginBottom: 4 }}><TipBody s={i} /></div>)}</>) : undefined} onMouseLeave={hide}
            onClick={its ? () => onState(st) : undefined} onKeyDown={its ? (e) => { if (e.key === "Enter") onState(st); } : undefined} />
        );
      })}
      <path d={borders} fill="none" stroke="var(--surface)" strokeWidth={1} strokeLinejoin="round" pointerEvents="none" />
      {states.map((f) => {
        const its = byState[FIPS[f.id]];
        if (!its) return null;
        const flip = its.some(flipOfSnap);
        const sel = selState === FIPS[f.id];
        const [cx, cy] = path.centroid(f as any);
        const done = its.every((i) => i.decision.state === "decided");
        return (
          <g key={"o" + f.id} pointerEvents="none">
            {(flip || sel) && <path d={path(f as any) ?? ""} fill="none" stroke={sel ? "var(--ink)" : "var(--flip)"} strokeWidth={sel ? 3 : 3.2} strokeLinejoin="round" />}
            {flip && sel && <path d={path(f as any) ?? ""} fill="none" stroke="var(--flip)" strokeWidth={1.4} strokeLinejoin="round" />}
            {done && <text x={cx} y={cy + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--on-strong)" stroke="none">✓</text>}
            {its.length > 1 && <circle cx={cx + 14} cy={cy + 14} r={9} style={{ fill: fillFor(its[1]) }} stroke="var(--surface)" strokeWidth={2} />}
          </g>
        );
      })}
    </svg>
  );
}

/** House: one hexagon per district. */
export function DemoHexMap({ snaps, selId, onPick }: { snaps: Snap[]; selId: string | null; onPick: (id: string) => void }) {
  const { show, hide } = useTip();
  const house = useMemo(() => snaps.filter((s) => s.row.o === "h"), [snaps]);
  const byKey = useMemo(() => Object.fromEntries(house.map((s) => [hexKey(s.row.id) ?? s.row.id, s])), [house]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const s of house) c[s.row.st] = (c[s.row.st] ?? 0) + 1; return c; }, [house]);
  const { cells, blocks, box, R } = useMemo(() => hexLayout(counts), [counts]);
  return (
    <svg viewBox={box.join(" ")} width="100%" role="img" aria-label="Map of all 435 House districts, one hexagon each, colored by how counting is going" style={{ display: "block" }}>
      <Defs />
      {blocks.map((b) => <text key={b.st} x={b.x + b.w / 2 - Math.sqrt(3) / 2} y={b.y - 1.35 * R} fontSize={1.05} textAnchor="middle" fill="var(--ink-muted)" fontWeight={600}>{b.st}</text>)}
      {cells.map((c) => {
        const s = byKey[`${c.st}-${c.d}`];
        if (!s) return null;
        const flip = flipOfSnap(s), sel = selId === s.row.id;
        return (
          <path key={s.row.id} d={hexPath(c.x, c.y, R * 0.94)} style={{ fill: fillFor(s), cursor: "pointer", transition: "fill .35s" }}
            stroke={sel ? "var(--ink)" : flip ? "var(--flip)" : "none"} strokeWidth={sel ? 0.4 : flip ? 0.34 : 0} strokeLinejoin="round" paintOrder="stroke"
            tabIndex={0} role="button" aria-label={`${s.row.title}: ${s.decision.why}`}
            onMouseMove={(e) => show(e, <TipBody s={s} />)} onMouseLeave={hide} onClick={() => onPick(s.row.id)} onKeyDown={(e) => { if (e.key === "Enter") onPick(s.row.id); }} />
        );
      })}
    </svg>
  );
}

export function MapLegend() {
  const sw = (bg: string, label: string, extra?: React.CSSProperties) => <span className="nm-key"><i style={{ background: bg, ...extra }} />{label}</span>;
  return (
    <div className="small nm-legend" aria-label="Map legend">
      {sw("var(--uncalled)", "Polls not closed")}
      {sw("repeating-linear-gradient(45deg, var(--uncalled) 0 3px, color-mix(in srgb, var(--ink-muted) 45%, var(--uncalled)) 3px 5px)", "Closed, nothing in yet")}
      <span className="nm-key"><i style={{ background: "var(--d-lean)" }} /><i style={{ background: "var(--r-lean)" }} />Leading (not decided)</span>
      {sw("var(--tossup)", "Within 1 point")}
      <span className="nm-key"><i style={{ background: "var(--d-safe)" }} /><i style={{ background: "var(--r-safe)" }} />Decided ✓</span>
      {sw("repeating-linear-gradient(-45deg, var(--uncalled) 0 3px, var(--ind-fill) 3px 6px)", "Runoff / ranked-choice / all-party primary")}
      <span className="nm-key"><i className="ring" />Decided flip</span>
    </div>
  );
}
