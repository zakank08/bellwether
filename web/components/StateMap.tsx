"use client";
import { geoPath } from "d3-geo";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { feature, mesh } from "topojson-client";
import us from "us-atlas/states-albers-10m.json";
import { BUCKET_LABEL, bucketVar, onBucket } from "@/lib/format";
import { FIPS, TILES } from "@/lib/tiles";
import type { Bucket } from "@/lib/types";
import { useTip } from "./Tooltip";
import { useReveal } from "./useReveal";

export type MapItem = { state: string; id: string; bucket: Bucket; title: string; tipLines: React.ReactNode; label?: string; flip?: "likely" | "could" };
const topFlip = (its?: MapItem[]) => (its?.some((i) => i.flip === "likely") ? "likely" : its?.some((i) => i.flip === "could") ? "could" : null);

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
  const { ref: box, hidden, animate, reduce } = useReveal<HTMLDivElement>(80);

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
              <path key={f.id} d={path(f as any) ?? ""}
                tabIndex={its ? 0 : -1} role={its ? "link" : undefined} aria-label={its ? `${its.map((i) => i.title + ": " + BUCKET_LABEL[i.bucket] + (i.flip ? (i.flip === "likely" ? ", likely to flip" : ", could flip") : "")).join("; ")}` : undefined}
                onMouseMove={(e) => show(e, tipFor(st))} onMouseLeave={hide} onClick={() => go(st)}
                onKeyDown={(e) => { if (e.key === "Enter") go(st); }}
                style={{ fill: hidden ? "var(--uncalled)" : fill, cursor: its ? "pointer" : "default", outline: "none",
                  transition: reduce ? "none" : animate ? `fill .5s ease ${Math.round(((path.centroid(f as any)[0] || 0) / 975) * 600)}ms` : "fill .4s" }} />
            );
          })}
          <path d={borders} fill="none" stroke="var(--surface)" strokeWidth={1} strokeLinejoin="round" pointerEvents="none" />
          {/* yellow outline: a race in this state is likely (thick) or could be (thin) to change parties */}
          {states.map((f) => { const t = topFlip(byState[FIPS[f.id]]); return t ? <path key={"fl" + f.id} d={path(f as any) ?? ""} fill="none" stroke="var(--flip)" strokeWidth={t === "likely" ? 3.2 : 1.8} strokeLinejoin="round" pointerEvents="none" /> : null; })}
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
                    <rect width={0.92} height={0.46} rx={0.03} style={{ fill: bucketVar(its[0].bucket), transition: reduce ? "none" : "fill .4s" }} />
                    <rect y={0.46} width={0.92} height={0.46} rx={0.03} style={{ fill: bucketVar(its[1].bucket), transition: reduce ? "none" : "fill .4s" }} />
                  </>
                ) : (
                  <rect width={0.92} height={0.92} rx={0.03} style={{ fill: its ? bucketVar(its[0].bucket) : "var(--uncalled)", transition: reduce ? "none" : "fill .4s" }} />
                )}
                {topFlip(its) && <rect x={-0.02} y={-0.02} width={0.96} height={0.96} rx={0.05} fill="none" stroke="var(--flip)" strokeWidth={topFlip(its) === "likely" ? 0.09 : 0.05} pointerEvents="none" />}
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

