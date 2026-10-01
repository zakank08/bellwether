"use client";
import { useState } from "react";
import type { CountyBase, CountyShape } from "@/lib/counties";
import { useLive } from "./useLive";

const norm = (s: string) => s.toLowerCase().replace(/\bcounty\b|\bparish\b|\bborough\b|\bcensus area\b/g, "").replace(/[^a-z0-9]/g, "");

/** Fill by Democratic-minus-Republican margin in points: four steps on each side, and a middle band within 3 points. */
export function marginFill(m: number): string {
  const a = Math.abs(m), d = m >= 0;
  if (a < 3) return "var(--tossup)";
  return `var(--${d ? "d" : "r"}-${a < 10 ? "lean" : a < 20 ? "likely" : "safe"})`;
}
const fmt = (m: number) => `${m >= 0 ? "Democratic" : "Republican"} +${Math.abs(m).toFixed(1)}`;

/** A state's counties. Shows the 2024 presidential result by default (context, from a compilation that is not authoritative).
 * On a statewide race page, switches to the live county count once the results feed carries counties for that race. */
export default function CountyMap({ shapes, w, h, base, raceId, stateName }: { shapes: CountyShape[]; w: number; h: number; base: CountyBase; raceId?: string; stateName: string }) {
  const { results, on } = useLive();
  const row = raceId ? results?.races.find((r) => r.race_id === raceId) : undefined;
  const liveByName = row?.counties ? new Map(Object.entries(row.counties).map(([k, v]) => [norm(k), v])) : null;
  const hasLive = !!liveByName && liveByName.size > 0;
  const [mode, setMode] = useState<"live" | "2024">("live");
  const live = hasLive && mode === "live";
  const [hover, setHover] = useState<string | null>(null);

  const info = (s: CountyShape) => {
    if (live) {
      const v = liveByName!.get(norm(s.name));
      const t = v ? v[0] + v[1] + v[2] : 0;
      return v && t > 0 ? { m: ((v[0] - v[1]) / t) * 100, txt: `${s.name} County: ${fmt(((v[0] - v[1]) / t) * 100)} (${t.toLocaleString("en-US")} votes counted)` } : { m: null, txt: `${s.name} County: no results yet` };
    }
    const v = base[s.fips];
    if (!v || !v[2]) return { m: null, txt: `${s.name} County: no data` };
    const m = ((v[0] - v[1]) / v[2]) * 100;
    return { m, txt: `${s.name} County, 2024 president: ${fmt(m)} (${v[2].toLocaleString("en-US")} votes)` };
  };
  const hovered = hover ? shapes.find((s) => s.fips === hover) : null;

  return (
    <figure className="county-map">
      {on && hasLive && (
        <div className="toggle small-toggle" role="group" aria-label="County map data" style={{ marginBottom: 10 }}>
          <button aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live count</button>
          <button aria-pressed={mode === "2024"} onClick={() => setMode("2024")}>2024 president</button>
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${stateName} county map: ${live ? "live count by county" : "2024 presidential result by county"}`} style={{ width: "100%", height: "auto", maxHeight: 460 }}>
        {shapes.map((s) => {
          const i = info(s);
          return (
            <path key={s.fips} d={s.d} fill={i.m == null ? "var(--uncalled)" : marginFill(i.m)} stroke="var(--surface)" strokeWidth={0.6}
              onMouseEnter={() => setHover(s.fips)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(s.fips)} onBlur={() => setHover(null)} tabIndex={-1}>
              <title>{i.txt}</title>
            </path>
          );
        })}
      </svg>
      <figcaption className="small muted" aria-live="polite" style={{ minHeight: 20 }}>
        {hovered ? info(hovered).txt : live ? "Color shows who leads the count in each county so far. Hover or tap a county for its numbers." : "Color shows the 2024 presidential margin in each county. Hover or tap a county for its numbers."}
      </figcaption>
      <div className="county-key small" aria-hidden="true">
        {["r-safe", "r-likely", "r-lean", "tossup", "d-lean", "d-likely", "d-safe"].map((k) => <span key={k} className="sw" style={{ background: `var(--${k})` }} />)}
        <span className="muted">20+ · 10 · 3 · within 3 · 3 · 10 · 20+ points (left: Republican, right: Democratic)</span>
      </div>
    </figure>
  );
}
