/** A pretend election night for rehearsal. It takes ONE simulated outcome from the forecast's own correlated
 * draws and releases it the way a real night unfolds: polls close state by state, counts arrive in an S-curve,
 * early counts lean differently from the final result, and each state's feed updates every few minutes.
 * Nothing here is a real result. Time is minutes after 6:00 PM ET on Nov. 3. */
import { decide, liveOdds, reportingFraction, type Decision, type Rule } from "./live.ts";
import type { WMeta } from "./whatif.ts";

export type CompactRace = { id: string; state: string; title: string; margin: number | null; incumbent_party: string | null; rules: Record<string, boolean>; district: number | null };
export type SchedRow = { state: string; first: number | null; last: number | null };

export type DemoRow = {
  id: string; o: "s" | "h"; st: string; title: string; dn: string | null; dp: string | null; rn: string | null; rp: string | null;
  c?: number; w?: string; mu0: number; sd0: number; rule: Rule; third: number; holder: "D" | "R" | null;
  openAt: number;          // polls close (first) in minutes after 6pm ET
  lastClose: number;       // last polls in the state close
  expected: number;        // expected total vote (an estimate, labeled as such)
  actual: number;          // what the total will really be (hidden from the model)
  start: number; dur: number; lean: number; cadence: number; offset: number;
};

export const END = 540;    // 3:00 AM ET
export const SLOW: Record<string, number> = { CA: 3.2, WA: 2.8, OR: 2.8, AZ: 2.8, NV: 2.6, AK: 2.6, UT: 2.0, CO: 1.5, PA: 1.7, MI: 1.5, WI: 1.4, NY: 1.5, NJ: 1.5, HI: 1.2 };

// ---- seeded randomness ---------------------------------------------------------------
export function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());

// ---- build the races -----------------------------------------------------------------
export function buildRows(meta: WMeta, sims: Int8Array, compact: CompactRace[], schedule: SchedRow[], leanSd = 4): DemoRow[] {
  const byId = new Map(compact.map((r) => [r.id, r]));
  const sched = new Map(schedule.map((s) => [s.state, s]));
  const off = meta.offset ?? 0;
  const perState: Record<string, number> = {};
  for (const r of meta.races) if (r.o === "h") perState[r.st] = (perState[r.st] ?? 0) + 1;
  return meta.races.map((r) => {
    const cr = byId.get(r.id);
    const rnd = rng(hash32("row:" + r.id));
    // forecast mean and spread
    let mu0 = cr?.margin ?? (r.w === "D" ? 20 : -20), sd0 = 8;
    if (r.c != null) {
      let s = 0, s2 = 0;
      for (let i = 0; i < meta.n; i++) { const m = (sims[i * meta.k + r.c] + off) * meta.scale; s += m; s2 += m * m; }
      mu0 = s / meta.n; sd0 = Math.max(2, Math.sqrt(Math.max(0, s2 / meta.n - mu0 * mu0)));
    }
    const rules = cr?.rules ?? {};
    const rule: Rule = rules.rcv ? "rcv" : rules.runoff ? "runoff" : rules.jungle_nov ? "primary" : "none";
    const third = rule === "primary" ? 35 : rule === "rcv" ? 8 : rule === "runoff" ? 3 : 2;
    const sc = sched.get(r.st);
    const first = (sc?.first ?? 480) - 360, last = (sc?.last ?? sc?.first ?? 480) - 360;
    const slow = SLOW[r.st] ?? 1;
    const expected = r.o === "h" ? Math.round((300 + rnd() * 120) * 1000) : Math.round((perState[r.st] ?? 1) * (330 + rnd() * 60) * 1000);
    const holder = cr?.incumbent_party === "D" || cr?.incumbent_party === "R" ? cr.incumbent_party : null;
    return {
      id: r.id, o: r.o, st: r.st, title: r.t, dn: r.dn, dp: r.dp, rn: r.rn, rp: r.rp, c: r.c, w: r.w, mu0, sd0, rule, third, holder,
      openAt: first, lastClose: last, expected, actual: Math.round(expected * (1 + 0.05 * gauss(rnd))),
      start: first + (8 + rnd() * 30) * slow, dur: (110 + rnd() * 150) * slow, lean: leanSd * gauss(rnd),
      cadence: 2 + Math.floor(rnd() * 5), offset: Math.floor(rnd() * 3),
    };
  });
}

// ---- scenarios -----------------------------------------------------------------------
export type Scenario = { kind: "typical" | "tight" | "wave"; draw: number; finals: Record<string, number>; label: string };
export const SCENARIOS: Record<Scenario["kind"], string> = {
  typical: "A typical night: the forecast's middle outcome",
  tight: "A tight Senate: Democrats stop one seat short of control",
  wave: "A Democratic wave night",
};

function seatTotals(meta: WMeta, sims: Int8Array, i: number) {
  const off = meta.offset ?? 0;
  let sd = meta.senate_not_up.D + meta.senate_not_up.I_caucus_D, hd = 0;
  for (const r of meta.races) {
    const dWin = r.c != null ? (sims[i * meta.k + r.c] + off) * meta.scale > 0 : r.w === r.dp;
    const party = r.c != null ? (dWin ? r.dp : r.rp) : r.w;
    if (party === "D") { if (r.o === "s") sd++; else hd++; }
  }
  return { sd, hd };
}

export function makeScenario(meta: WMeta, sims: Int8Array, rows: DemoRow[], kind: Scenario["kind"]): Scenario {
  const sd: number[] = [], hd: number[] = [];
  for (let i = 0; i < meta.n; i++) { const t = seatTotals(meta, sims, i); sd.push(t.sd); hd.push(t.hd); }
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
  let draw = -1;
  if (kind === "typical") { const ms = med(sd), mh = med(hd); draw = sd.findIndex((s, i) => s === ms && Math.abs(hd[i] - mh) <= 2); }
  else if (kind === "tight") { const mh = med(hd); draw = sd.findIndex((s, i) => s === meta.senate_majority - 1 && Math.abs(hd[i] - mh) <= 12); }
  else { const h90 = q(hd, 0.9), s60 = q(sd, 0.6); draw = sd.findIndex((s, i) => hd[i] >= h90 && s >= s60); }
  if (draw < 0) draw = 0;
  const off = meta.offset ?? 0, finals: Record<string, number> = {};
  for (const r of rows) {
    if (r.c != null) finals[r.id] = (sims[draw * meta.k + r.c] + off) * meta.scale;
    else { const m = Math.abs(r.mu0) < 5 ? 5 : Math.abs(r.mu0); finals[r.id] = r.w === r.dp ? m : -m; }
  }
  return { kind, draw, finals, label: SCENARIOS[kind] };
}

// ---- failure drills ------------------------------------------------------------------
export type Drills = { down: boolean; manual: boolean; bad: boolean; backward: boolean };
export const DRILL_DEFAULTS = { down: { state: "PA", at: 210, manualAt: 330, source: "the county election pages" }, bad: { state: "NV", at: 330, until: 390 }, backward: { state: "GA", at: 300, until: 320 } };

export type FeedStatus = "closed" | "waiting" | "ok" | "stale" | "error" | "review" | "manual";
export type Feed = { tEff: number | null; status: FeedStatus; note?: string };

/** What a state's feed is giving us at time t: the time its newest usable numbers are from, and its health. */
export function feedAt(row: DemoRow, t: number, drills: Drills): Feed {
  if (t < row.openAt) return { tEff: null, status: "closed" };
  if (t < row.start) return { tEff: null, status: "waiting" };
  let tEff = Math.floor((t - row.offset) / row.cadence) * row.cadence + row.offset;
  if (tEff > t) tEff -= row.cadence;
  const D = DRILL_DEFAULTS;
  if (drills.down && row.st === D.down.state && t >= D.down.at) {
    if (drills.manual && t >= D.down.manualAt) {
      const m = Math.floor((t - D.down.manualAt) / 15) * 15 + D.down.manualAt - 10;
      return { tEff: m, status: "manual", note: `Entered by hand from ${D.down.source} (the state feed has been down since ${D.down.at})` };
    }
    const stuck = Math.min(tEff, D.down.at);
    return { tEff: stuck, status: t - D.down.at >= 8 ? "stale" : "ok", note: t - D.down.at >= 8 ? "No new numbers from the state's feed" : undefined };
  }
  if (drills.bad && row.st === D.bad.state && t >= D.bad.at && t < D.bad.until)
    return { tEff: Math.min(tEff, D.bad.at), status: "error", note: "The state sent data we couldn't read. Showing the last good numbers" };
  if (drills.backward && row.st === D.backward.state && t >= D.backward.at && t < D.backward.until)
    return { tEff, status: "review", note: "A count went down. We kept the higher count and flagged it for review" };
  return { tEff, status: "ok" };
}

// ---- what a race looks like at time t ------------------------------------------------
export type Snap = {
  row: DemoRow; feed: Feed; f: number; counted: number; units: number; margin: number | null;
  decision: Decision; p: number; mu: number; sd: number; tEff: number | null;
};

export function truthAt(row: DemoRow, finalMargin: number, tEff: number) {
  const f = reportingFraction(tEff, row.start, row.dur);
  const r = rng(hash32(`n:${row.id}:${tEff}`));
  const margin = finalMargin - row.lean * (1 - f) + gauss(r) * 1.3 * (1 - f) * (1 - f);
  const units = Math.min(1, f + 0.02 * gauss(r));
  return { f, counted: Math.round(f * row.actual), margin, units: Math.max(0, units) };
}

export function snapshot(row: DemoRow, finalMargin: number, t: number, drills: Drills): Snap {
  const feed = feedAt(row, t, drills);
  if (feed.tEff == null) {
    const p = liveOdds(row.mu0, row.sd0, null);
    return { row, feed, f: 0, counted: 0, units: 0, margin: null, decision: { state: "waiting", winner: null, why: feed.status === "closed" ? "Polls not closed yet" : "Polls closed; no results yet" }, p: p.p, mu: p.mu, sd: p.sd, tEff: null };
  }
  const tr = truthAt(row, finalMargin, feed.tEff);
  const fExp = tr.counted / row.expected;   // share of the EXPECTED vote (an estimate) the model sees
  const done = tr.f >= 0.995;
  const decision = decide({ margin: tr.margin, counted: tr.counted, expected: row.expected, units: done ? 1 : tr.units, rule: row.rule, thirdShare: row.third, state: row.st });
  const odds = liveOdds(row.mu0, row.sd0, { margin: tr.margin, f: Math.min(fExp, 1) });
  const p = decision.winner === "dside" ? 1 : decision.winner === "rside" ? 0 : odds.p;
  return { row, feed, f: fExp, counted: tr.counted, units: tr.units, margin: tr.margin, decision, p, mu: odds.mu, sd: odds.sd, tEff: feed.tEff };
}

/** True winner's side for a final margin. */
export const winnerSide = (finalMargin: number): "dside" | "rside" => (finalMargin >= 0 ? "dside" : "rside");
export const partyOf = (row: DemoRow, side: "dside" | "rside") => (side === "dside" ? row.dp : row.rp);

export function clock(t: number) {
  const mins = (18 * 60 + t) % (24 * 60), h24 = Math.floor(mins / 60), m = mins % 60;
  const h = ((h24 + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

// ---- display helpers -------------------------------------------------------------------
/** Votes counted so far for each side, from the counted margin (D minus R, in points of all votes) and the
 * share going to other candidates. */
export function candidateVotes(s: Snap) {
  const c = s.counted, T = s.row.third, m = s.margin ?? 0;
  const d = Math.round((c * (100 - T + m)) / 200), r = Math.round((c * (100 - T - m)) / 200), o = Math.max(0, c - d - r);
  const pct = (v: number) => (c > 0 ? (v / c) * 100 : 0);
  return { d, r, o, total: c, dPct: pct(d), rPct: pct(r), oPct: pct(o) };
}

/** "2026-house-PA-07" -> "PA-7" key used by the hex layout (at-large districts count as 1). */
export function hexKey(id: string): string | null {
  const m = /^2026-house-([A-Z]{2})-(\d{2})$/.exec(id);
  return m ? `${m[1]}-${parseInt(m[2], 10) || 1}` : null;
}

export type MapStatus = "closed" | "waiting" | "counting" | "close" | "decided" | "special";
export function mapStatus(s: Snap): MapStatus {
  const st = s.decision.state;
  if (st === "decided") return "decided";
  if (st === "runoff" || st === "rcv" || st === "primary") return "special";
  if (st === "close") return "close";
  if (s.feed.tEff == null) return s.feed.status === "closed" ? "closed" : "waiting";
  return st === "waiting" ? "waiting" : "counting";
}
