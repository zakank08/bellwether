"use client";
import { geoPath } from "d3-geo";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { feature, mesh } from "topojson-client";
import us from "us-atlas/states-albers-10m.json";
import { BUCKET_LABEL, bucketVar, onBucket } from "@/lib/format";
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
  const box = useRef<HTMLDivElement>(null);
  const seen = useInView(box, { once: true, margin: "0px 0px -80px 0px" }) || !!reduce;
  const [swept, setSwept] = useState(false);
  useEffect(() => { if (seen && !swept) { const t = setTimeout(() => setSwept(true), 1200); return () => clearTimeout(t); } }, [seen, swept]);

  const tipFor = (st: string) => {
    const its = byState[st];
    if (!its) return <><strong>{st}</strong><br /><span className="muted">{notUpLabel}</span></>;
    return its.map((it) => <div key={it.id} style={{ marginBottom: 4 }}><strong>{it.title}</strong><br />{it.tipLines}</div>);
  };
  const go = (st: string) => { const its = byState[st]; if (its?.length) router.push(`/race/${its[0].id}/`); };

  return (
    <div ref={box}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="small muted">Tap or hover a state for details; select it to open the race.</span>
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
              <motion.path key={f.id} d={path(f as any) ?? ""} initial={reduce ? false : { fill: "var(--uncalled)" }} animate={{ fill: seen ? fill : "var(--uncalled)" }}
                transition={reduce ? tr : { duration: 0.5, delay: seen && !swept ? ((path.centroid(f as any)[0] || 0) / 975) * 0.6 : 0 }}
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

