/** What-if engine: conditions the forecast's own simulations on the reader's
 * picks, so correlated races move together. Pure functions, no React. */
export type WRace = {
  id: string; o: "s" | "h"; st: string; d: number | null; t: string;
  dn: string | null; dp: string | null; rn: string | null; rp: string | null;
  c?: number; el?: number; w?: string;
};
export type WMeta = {
  n: number; k: number; scale: number; offset?: number; races: WRace[];
  senate_not_up: { D: number; R: number; I_caucus_D: number };
  senate_majority: number; house_majority: number; vp: "R" | "D"; asof: string;
};
export type Pick = "dside" | "rside";
export type Picks = Record<string, Pick>;

export type Result = {
  mode: "conditional" | "forced";
  kept: number;
  p: Record<string, number>;            // P(D-side wins) per race
  chamber: Record<"s" | "h", { D: number; R: number; C: number; medianD: number; hist: Map<number, number>; meanD: number }>;
};

export function compute(meta: WMeta, sims: Int8Array, picks: Picks, shift: number): Result {
  const { n, k, scale } = meta;
  const off = meta.offset ?? 0;
  const pickCols: [number, number][] = []; // [col, sign] sign=+1 means D-side must win
  const forcedFixed: Record<string, Pick> = {};
  for (const r of meta.races) {
    const pk = picks[r.id];
    if (!pk) continue;
    if (r.c != null) pickCols.push([r.c, pk === "dside" ? 1 : -1]);
    else forcedFixed[r.id] = pk;
  }
  const valid = new Uint8Array(n);
  let kept = 0;
  for (let i = 0; i < n; i++) {
    let ok = 1;
    const base = i * k;
    for (const [c, sg] of pickCols) {
      const m = (sims[base + c] + off) * scale + shift;
      if ((m > 0 ? 1 : -1) !== sg) { ok = 0; break; }
    }
    valid[i] = ok;
    kept += ok;
  }
  const mode: Result["mode"] = pickCols.length === 0 || kept >= 150 ? "conditional" : "forced";
  const use = (i: number) => (mode === "conditional" ? valid[i] === 1 : true);
  const used = mode === "conditional" ? kept || n : n;

  const winsD = new Float64Array(k);
  const cnt: Record<"s" | "h", { D: Int16Array; R: Int16Array }> = {
    s: { D: new Int16Array(n), R: new Int16Array(n) }, h: { D: new Int16Array(n), R: new Int16Array(n) },
  };
  // fixed (non-simulated) races
  const fixedAdd = { s: { D: 0, R: 0 }, h: { D: 0, R: 0 } };
  for (const r of meta.races) {
    if (r.c != null) continue;
    const pk = forcedFixed[r.id];
    const party = pk ? (pk === "dside" ? r.dp : r.rp) : r.w;
    if (party === "D") fixedAdd[r.o].D++;
    else if (party === "R") fixedAdd[r.o].R++;
  }
  const simRaces = meta.races.filter((r) => r.c != null);
  for (let i = 0; i < n; i++) {
    if (!use(i)) continue;
    const base = i * k;
    for (const r of simRaces) {
      const c = r.c!;
      let dWin: boolean;
      const pk = picks[r.id];
      if (mode === "forced" && pk) dWin = pk === "dside";
      else dWin = (sims[base + c] + off) * scale + shift * (r.el ?? 1) > 0;
      if (dWin) winsD[c]++;
      const party = dWin ? r.dp : r.rp;
      if (party === "D") cnt[r.o].D[i]++;
      else if (party === "R") cnt[r.o].R[i]++;
    }
  }
  const p: Record<string, number> = {};
  for (const r of meta.races) {
    if (r.c != null) p[r.id] = picks[r.id] ? (picks[r.id] === "dside" ? 1 : 0) : winsD[r.c] / used;
    else p[r.id] = forcedFixed[r.id] ? (forcedFixed[r.id] === "dside" ? 1 : 0) : r.w === r.dp ? 1 : 0;
  }
  const chamber = {} as Result["chamber"];
  for (const o of ["s", "h"] as const) {
    let D = 0, R = 0, C = 0, sum = 0;
    const hist = new Map<number, number>();
    const ds: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!use(i)) continue;
      let d = cnt[o].D[i] + fixedAdd[o].D, rr = cnt[o].R[i] + fixedAdd[o].R;
      if (o === "s") { d += meta.senate_not_up.D + meta.senate_not_up.I_caucus_D; rr += meta.senate_not_up.R; }
      const maj = o === "s" ? meta.senate_majority : meta.house_majority;
      const rNeed = o === "s" && meta.vp === "R" ? maj - 1 : maj;
      if (d >= maj) D++; else if (rr >= rNeed) R++; else C++;
      hist.set(d, (hist.get(d) ?? 0) + 1);
      sum += d; ds.push(d);
    }
    ds.sort((a, b) => a - b);
    chamber[o] = { D: D / used, R: R / used, C: C / used, meanD: sum / used, medianD: ds[Math.floor(ds.length / 2)] ?? 0, hist };
  }
  return { mode, kept, p, chamber };
}

/** Likeliest path: bank the seats a party is already very likely to win, then
 * add the uncalled races it's most likely to win until it has a majority. */
export function pathTo(meta: WMeta, res: Result, office: "s" | "h", party: "D" | "R") {
  const races = meta.races.filter((r) => r.o === office && (r.dp === party || r.rp === party));
  const pw = (r: WRace) => (r.dp === party ? res.p[r.id] : 1 - res.p[r.id]);
  let banked = 0;
  if (office === "s") banked = party === "D" ? meta.senate_not_up.D + meta.senate_not_up.I_caucus_D : meta.senate_not_up.R;
  const need = office === "s" ? (party === "R" && meta.vp === "R" ? meta.senate_majority - 1 : meta.senate_majority) : meta.house_majority;
  const safe = races.filter((r) => pw(r) >= 0.95);
  banked += safe.length;
  const rest = races.filter((r) => pw(r) < 0.95 && pw(r) > 0).sort((a, b) => pw(b) - pw(a));
  const steps: { r: WRace; p: number }[] = [];
  let have = banked;
  for (const r of rest) {
    if (have >= need) break;
    steps.push({ r, p: pw(r) });
    have++;
  }
  return { need, banked, steps, reachable: have >= need };
}

// ---- share links: #s=GA:D,TX:R&h=PA-07:R&x=2.5 --------------------------------
export function encode(meta: WMeta, picks: Picks, shift: number): string {
  const parts: Record<string, string[]> = { s: [], h: [] };
  for (const r of meta.races) {
    const pk = picks[r.id];
    if (!pk) continue;
    const key = r.o === "s" ? r.id.replace("2026-sen-", "") : r.id.replace("2026-house-", "");
    const party = pk === "dside" ? r.dp : r.rp;
    parts[r.o].push(`${key}:${party}`);
  }
  const q: string[] = [];
  if (parts.s.length) q.push("s=" + parts.s.join(","));
  if (parts.h.length) q.push("h=" + parts.h.join(","));
  if (shift) q.push("x=" + shift);
  return q.join("&");
}

export function decode(meta: WMeta, hash: string): { picks: Picks; shift: number } {
  const picks: Picks = {};
  let shift = 0;
  const qs = new URLSearchParams(hash.replace(/^#/, ""));
  const byKey: Record<string, WRace> = {};
  for (const r of meta.races) byKey[(r.o === "s" ? "s:" + r.id.replace("2026-sen-", "") : "h:" + r.id.replace("2026-house-", ""))] = r;
  for (const o of ["s", "h"]) {
    for (const item of (qs.get(o) ?? "").split(",").filter(Boolean)) {
      const [key, party] = item.split(":");
      const r = byKey[`${o}:${key}`];
      if (!r) continue;
      if (party === r.dp) picks[r.id] = "dside";
      else if (party === r.rp) picks[r.id] = "rside";
    }
  }
  const x = parseFloat(qs.get("x") ?? "0");
  if (Number.isFinite(x)) shift = Math.max(-10, Math.min(10, x));
  return { picks, shift };
}
