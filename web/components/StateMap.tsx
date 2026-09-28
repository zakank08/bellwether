"use client";
import { geoPath } from "d3-geo";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { feature, mesh } from "topojson-client";
import us from "us-atlas/states-albers-10m.json";
import { BUCKET_LABEL, bucketVar, in100, onBucket, PARTY_NAME } from "@/lib/format";
import { FIPS, TILES } from "@/lib/tiles";
import type { Bucket } from "@/lib/types";
import { useTip } from "./Tooltip";

export type MapItem = { state: string; id: string; bucket: Bucket; title: string; tipLines: React.ReactNode; label?: string };

const path = geoPath();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = us as any;
const states = (feature(topo, topo.objects.states) as any).features as { id: string; properties: { name: string } }[];
const borders = path(mesh(topo, topo.objects.states, (a: unknown, b: unknown) => a !== b) as any) ?? "";

/** Geographic or tile view. Several races in one state (a special election)
 * split the tile. States with no race this cycle are drawn neutral. */
export default function StateMap({ items, title, notUpLabel = "No race this cycle" }: { items: MapItem[]; title: string; notUpLabel?: string }) {
  const [mode, setMode] = useState<"geo" | "tile">("geo");
  const byState = useMemo(() => {
    const m: Record<string, MapItem[]> = {};
    for (const it of items) (m[it.state] ??= []).push(it);
    return m;
  }, [items]);
  const { show, hide } = useTip();
  const router = useRouter();
  const reduce = useReducedMotion();
  const tr = reduce ? { duration: 0 } : { duration: 0.4, ease: "easeOut" as const };

  const tipFor = (st: string) => {
    const its = byState[st];
    if (!its) return <><strong>{st}</strong><br /><span className="muted">{notUpLabel}</span></>;
    return its.map((it) => <div key={it.id} style={{ marginBottom: 4 }}><strong>{it.title}</strong><br />{it.tipLines}</div>);
  };
  const go = (st: string) => { const its = byState[st]; if (its?.length) router.push(`/race/${its[0].id}/`); };

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="small muted">Hover or tap a state for details; select it to open the race.</span>
        <div className="toggle" role="group" aria-label="Map style">
          <button aria-pressed={mode === "geo"} onClick={() => setMode("geo")}>Map</button>
          <button aria-pressed={mode === "tile"} onClick={() => setMode("tile")}>Tiles</button>
        </div>
      </div>
      {mode === "geo" ? (
        <svg viewBox="0 0 975 610" width="100%" role="img" aria-label={title} style={{ display: "block" }}>
          {states.map((f) => {
            const st = FIPS[f.id];
            const its = byState[st];
            const fill = its ? bucketVar(its[0].bucket) : "var(--uncalled)";
            return (
              <motion.path key={f.id} d={path(f as any) ?? ""} animate={{ fill }} transition={tr}
                tabIndex={its ? 0 : -1} role={its ? "link" : undefined} aria-label={its ? `${its.map((i) => i.title + ": " + BUCKET_LABEL[i.bucket]).join("; ")}` : undefined}
                onMouseMove={(e) => show(e, tipFor(st))} onMouseLeave={hide} onClick={() => go(st)}
                onKeyDown={(e) => { if (e.key === "Enter") go(st); }}
                style={{ cursor: its ? "pointer" : "default", outline: "none" }} />
            );
          })}
          <path d={borders} fill="none" stroke="var(--surface)" strokeWidth={1} strokeLinejoin="round" pointerEvents="none" />
          {/* specials: a ring marks states with two races */}
          {Object.entries(byState).filter(([, v]) => v.length > 1).map(([st]) => {
            const f = states.find((s) => FIPS[s.id] === st);
            if (!f) return null;
            const [cx, cy] = path.centroid(f as any);
            return <circle key={st} cx={cx} cy={cy} r={9} fill={bucketVar(byState[st][1].bucket)} stroke="var(--surface)" strokeWidth={2} pointerEvents="none" />;
          })}
        </svg>
      ) : (
        <svg viewBox="0 0 12 8.2" width="100%" role="img" aria-label={title} style={{ display: "block", maxWidth: 720, margin: "0 auto" }}>
          {Object.entries(TILES).map(([st, [c, r]]) => {
            const its = byState[st];
            return (
              <g key={st} transform={`translate(${c + 0.04},${r + 0.04})`} style={{ cursor: its ? "pointer" : "default" }}
                onMouseMove={(e) => show(e, tipFor(st))} onMouseLeave={hide} onClick={() => go(st)}
                tabIndex={its ? 0 : -1} role={its ? "link" : undefined} onKeyDown={(e) => { if (e.key === "Enter") go(st); }}
                aria-label={its ? its.map((i) => `${i.title}: ${BUCKET_LABEL[i.bucket]}`).join("; ") : `${st}: ${notUpLabel}`}>
                {its && its.length > 1 ? (
                  <>
                    <motion.rect width={0.92} height={0.46} rx={0.03} animate={{ fill: bucketVar(its[0].bucket) }} transition={tr} />
                    <motion.rect y={0.46} width={0.92} height={0.46} rx={0.03} animate={{ fill: bucketVar(its[1].bucket) }} transition={tr} />
                  </>
                ) : (
                  <motion.rect width={0.92} height={0.92} rx={0.03} animate={{ fill: its ? bucketVar(its[0].bucket) : "var(--uncalled)" }} transition={tr} />
                )}
                <text x={0.46} y={0.52} textAnchor="middle" fontSize={0.26} fontWeight={600}
                  fill={its ? onBucket(its[0].bucket) : "var(--ink-muted)"} pointerEvents="none">{st}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

export function Legend({ showInd = false }: { showInd?: boolean }) {
  const steps: Bucket[] = ["d-safe", "d-likely", "d-lean", "tossup", "r-lean", "r-likely", "r-safe"];
  return (
    <div aria-label="Map legend" style={{ maxWidth: 560 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {steps.map((b) => <div key={b} style={{ height: 12, background: bucketVar(b), borderRadius: 2 }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, fontSize: 12, lineHeight: "16px", color: "var(--ink-muted)", textAlign: "center", marginTop: 4 }}>
        {steps.map((b) => <span key={b}>{BUCKET_LABEL[b]}</span>)}
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>
        Solid ≥95 in 100 · Likely 75–95 · Lean 60–75 · Toss-up under 60 for either side
        {showInd && <> · <span style={{ display: "inline-block", width: 10, height: 10, background: "var(--ind-fill)", borderRadius: 2 }} /> Independent favored</>}
      </div>
    </div>
  );
}

export function tipLinesFor(dName: string | null, dParty: string | null, rName: string | null, rParty: string | null, p: number) {
  return (
    <>
      <span style={{ color: "var(--dem)" }}>{dName ?? "—"}{dParty && dParty !== "D" ? ` (${PARTY_NAME[dParty]})` : ""}</span>: <strong className="num">{in100(p)} in 100</strong><br />
      {rName && <><span style={{ color: rParty === "R" ? "var(--rep)" : "var(--ind)" }}>{rName}</span>: <strong className="num">{in100(1 - p)} in 100</strong></>}
    </>
  );
}
