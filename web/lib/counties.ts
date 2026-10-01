import fs from "node:fs";
import path from "node:path";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import topo from "us-atlas/counties-10m.json";

export type CountyShape = { fips: string; name: string; d: string };
export type CountyBase = Record<string, [number, number, number]>;

let base: { source: string; note: string; counties: CountyBase } | null = null;
export function county2024() {
  if (!base) base = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "county2024.json"), "utf8"));
  return base!;
}

/** SVG outlines of one state's counties, drawn once at build time. Returns null where county shapes would mislead
 * (Alaska reports by House district; Connecticut by town, but the shapes are the old counties). */
export function countyShapes(stateFips: string): { shapes: CountyShape[]; w: number; h: number } | null {
  if (stateFips === "02" || stateFips === "09") return null;
  const all = feature(topo as any, (topo as any).objects.counties) as any;
  const fc = { type: "FeatureCollection", features: all.features.filter((f: any) => String(f.id).startsWith(stateFips)) } as any;
  if (!fc.features.length) return null;
  const w = 640, h = 420;
  const proj = geoMercator().fitExtent([[6, 6], [w - 6, h - 6]], fc);
  const p = geoPath(proj).digits(1);
  return { shapes: fc.features.map((f: any) => ({ fips: String(f.id), name: f.properties.name, d: p(f) ?? "" })), w, h };
}
