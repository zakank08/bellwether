// Builds web/public/data/districts/<ST>.json: one SVG outline per 2026 U.S. House district, for the state drill-down on the live board.
// Source: Census Bureau TIGER/Line 2026, 120th Congress districts (https://www2.census.gov/geo/tiger/TIGER2026/CD/), the maps in force for the 2026 elections.
// Districts are matched by the Census district number only (never to pre-2026 data), which is what the redrawn-map states require.
//
//   mkdir /tmp/distbuild && cd /tmp/distbuild && npm i shapefile d3-geo topojson-server topojson-simplify topojson-client
//   node /path/to/pipeline/tools/build_districts.mjs /path/to/web/public/data/districts
//
// Single-district states (AK, DE, ND, SD, VT, WY) are skipped: the whole state is the district.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { open } from "shapefile";
import { geoMercator, geoPath } from "d3-geo";
import { topology } from "topojson-server";
import { presimplify, simplify } from "topojson-simplify";
import { feature } from "topojson-client";

const OUT = process.argv[2] || "districts";
const TMP = path.join(process.env.TMPDIR || "/tmp", "cd2026");
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const FIPS = { "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY" };
const SINGLE = new Set(["AK", "DE", "ND", "SD", "VT", "WY"]);
const W = 640, H = 420;

for (const [fips, st] of Object.entries(FIPS)) {
  if (SINGLE.has(st)) continue;
  const zip = path.join(TMP, `tl_2026_${fips}_cd120.zip`), dir = path.join(TMP, fips);
  if (!fs.existsSync(zip)) execFileSync("curl", ["-sSf", "-m", "180", "-o", zip, `https://www2.census.gov/geo/tiger/TIGER2026/CD/tl_2026_${fips}_cd120.zip`]);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  execFileSync("unzip", ["-oq", zip, "-d", dir]);
  const base = fs.readdirSync(dir).find((f) => f.endsWith(".shp")).replace(/\.shp$/, "");
  const src = await open(path.join(dir, base + ".shp"), path.join(dir, base + ".dbf"));
  const feats = [];
  for (let r = await src.read(); !r.done; r = await src.read()) {
    const geoid = r.value.properties.GEOID || r.value.properties.GEOID20 || "";
    const dn = parseInt(geoid.slice(2), 10);
    if (!(dn >= 0 && dn < 90)) continue;                       // 98/99 = no district (non-voting areas, water)
    feats.push({ type: "Feature", properties: { dn }, geometry: r.value.geometry });
  }
  const fc = { type: "FeatureCollection", features: feats };
  const proj = geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], fc);
  const planar = { type: "FeatureCollection", features: feats.map((f) => ({ ...f, geometry: projectGeom(f.geometry, proj) })) };
  let topo = topology({ d: planar });
  topo = presimplify(topo);
  topo = simplify(topo, 0.08);                                // drop detail smaller than about a quarter of a pixel (weights are in px²)
  const out = feature(topo, topo.objects.d).features;
  const gp = geoPath().digits(1);
  const districts = out.map((f) => ({ id: `2026-house-${st}-${String(f.properties.dn).padStart(2, "0")}`, d: gp(f) || "" })).filter((x) => x.d);
  fs.writeFileSync(path.join(OUT, `${st}.json`), JSON.stringify({ w: W, h: H, source: "Census Bureau TIGER/Line 2026, 120th Congress districts", districts }));
  console.log(st, districts.length, Math.round(fs.statSync(path.join(OUT, `${st}.json`)).size / 1024) + " KB");
}

function projectGeom(g, p) {
  const pt = (c) => p(c) || [0, 0];
  const ring = (r) => r.map(pt);
  if (g.type === "Polygon") return { type: "Polygon", coordinates: g.coordinates.map(ring) };
  if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: g.coordinates.map((poly) => poly.map(ring)) };
  return g;
}
