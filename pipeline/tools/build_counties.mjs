// Builds web/public/data/counties/<ST>.json: county outlines (SVG paths) plus the 2024 presidential vote for each county, for the state drill-down
// on the live board. Run from the web folder (it uses web's installed d3-geo, topojson-client and us-atlas):
//   cp pipeline/tools/build_counties.mjs web/ && cd web && node build_counties.mjs && rm build_counties.mjs
// Alaska (reports by House district) and Connecticut (by town) are skipped: their results do not match county shapes.
import fs from "node:fs";
import path from "node:path";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const topo = JSON.parse(fs.readFileSync("node_modules/us-atlas/counties-10m.json", "utf8"));
const base = JSON.parse(fs.readFileSync("public/data/county2024.json", "utf8"));
const FIPS = { "01": "AL", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "10": "DE", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY" };
const all = feature(topo, topo.objects.counties).features;
const OUT = "public/data/counties"; fs.mkdirSync(OUT, { recursive: true });
const W = 640, H = 420;
for (const [fips, st] of Object.entries(FIPS)) {
  const fc = { type: "FeatureCollection", features: all.filter((f) => String(f.id).startsWith(fips)) };
  if (!fc.features.length) continue;
  const p = geoPath(geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], fc)).digits(1);
  const counties = fc.features.map((f) => ({ fips: String(f.id), name: f.properties.name, d: p(f) || "", v: base.counties[String(f.id)] ?? null }));
  fs.writeFileSync(path.join(OUT, `${st}.json`), JSON.stringify({ w: W, h: H, source: base.source, counties }));
}
console.log("done");
