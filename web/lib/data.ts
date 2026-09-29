import fs from "node:fs";
import path from "node:path";
import type { Forecast, RaceDetail, RaceRow } from "./types";

const DIR = path.join(process.cwd(), "public", "data");
const memo = new Map<string, unknown>();
// Build-time reads are cached: 500+ race pages all read the same summary files.
const read = <T,>(f: string): T => {
  if (!memo.has(f)) memo.set(f, JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));
  return memo.get(f) as T;
};
const readOpt = <T,>(f: string): T | null => (fs.existsSync(path.join(DIR, f)) ? read<T>(f) : null);

export const getForecast = () => read<Forecast>("forecast.json");
export const getRaces = () => read<RaceRow[]>("races.json");
export const getRace = (id: string) => read<RaceDetail>(`race/${id}.json`);
export type HistPoint = { date: string; senate: Record<string, number>; house: Record<string, number>; senate_seats: number; house_seats: number; races?: Record<string, number> };
export const getHistory = () => readOpt<{ points: HistPoint[]; backcast_until?: string }>("history.json");

/** Chamber odds over time only (the per-race detail stays server-side). */
export function chamberHistory() {
  const h = getHistory();
  if (!h) return null;
  return { backcast_until: h.backcast_until ?? null, points: h.points.map(({ date, senate, house, senate_seats, house_seats }) => ({ date, senate, house, senate_seats, house_seats })) };
}

/** Last `days` of each listed race's D-side chance, for sparklines. */
export function sparks(ids: string[], days = 30): Record<string, number[]> {
  const h = getHistory();
  if (!h?.points.length) return {};
  const endDate = h.points[h.points.length - 1].date;
  const start = new Date(new Date(endDate + "T12:00:00Z").getTime() - days * 864e5).toISOString().slice(0, 10);
  const pts = h.points.filter((p) => p.date >= start);
  const out: Record<string, number[]> = {};
  for (const id of ids) {
    const v = pts.map((p) => p.races?.[id]).filter((x): x is number => x != null);
    if (v.length >= 2) out[id] = v;
  }
  return out;
}

/** Races whose D-side chance moved most over the last `days`. */
export function movers(days = 7, n = 8) {
  const h = getHistory();
  if (!h || h.points.length < 2) return [];
  const last = h.points[h.points.length - 1];
  const target = new Date(new Date(last.date + "T12:00:00Z").getTime() - days * 864e5).toISOString().slice(0, 10);
  const prev = [...h.points].reverse().find((p) => p.date <= target);
  if (!prev?.races || !last.races) return [];
  const rows = Object.fromEntries(getRaces().map((r) => [r.id, r]));
  return Object.entries(last.races)
    .filter(([id]) => prev.races![id] != null && rows[id]?.kind === "two_party")
    .map(([id, p]) => ({ id, title: rows[id].title, office: rows[id].office, dside: rows[id].dside, rside: rows[id].rside, from: prev.races![id], to: p, since: prev.date }))
    .filter((m) => Math.abs(m.to - m.from) >= 0.02)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, n);
}
export type Mover = ReturnType<typeof movers>[number];

export const getSchedule = () => readOpt<{ source: string; fallback_source?: string; fallback_url?: string; states: { state: string; state_name: string; close: string | null; close_source?: string | null; first: number | null; last: number | null; times: string[]; races: string[] }[]; key_dates: { date: string; label: string; note: string }[] }>("schedule.json");
export const getGeneric = () => read<{ average: number; se: number; n_polls: number; trend: { date: string; margin: number; se: number }[]; polls: { pollster: string; end: string; n: number | null; pop: string | null; raw: number; adjusted: number; url: string | null }[] }>("generic.json");
export const getApproval = () => read<{ net: number; trend: { date: string; margin: number; se: number }[]; polls: { pollster: string; end: string; n: number | null; pop: string | null; approve: number; disapprove: number; url: string | null }[] }>("approval.json");
export const getPollsters = () => read<{ ratings: any[]; active: any[] }>("pollsters.json");
export const getBacktest = () => readOpt<any>("backtest.json");

/** Trim a race row to what the dashboard needs, to keep page payloads small. */
export function compactRows(rows: RaceRow[]) {
  return rows.map((r) => ({
    id: r.id, office: r.office, state: r.state, state_name: r.state_name, district: r.district, special: r.special,
    title: r.title, kind: r.kind, dside: r.dside, rside: r.rside, p: r.p, rating: r.rating, margin: r.margin,
    incumbent_party: r.incumbent_party, open: r.open, n_polls: r.n_polls, p_runoff: r.p_runoff, rules: r.rules,
  }));
}
export type CompactRow = ReturnType<typeof compactRows>[number];

export type Upcoming = { date: string; label: string; detail: string; href?: string; source: string };
export const getUpcoming = () => readOpt<Upcoming[]>("upcoming.json") ?? [];
