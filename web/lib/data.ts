import fs from "node:fs";
import path from "node:path";
import type { Forecast, RaceDetail, RaceRow } from "./types";

const DIR = path.join(process.cwd(), "public", "data");
const read = <T,>(f: string): T => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as T;
const readOpt = <T,>(f: string): T | null => (fs.existsSync(path.join(DIR, f)) ? read<T>(f) : null);

export const getForecast = () => read<Forecast>("forecast.json");
export const getRaces = () => read<RaceRow[]>("races.json");
export const getRace = (id: string) => read<RaceDetail>(`race/${id}.json`);
export const getHistory = () => readOpt<{ points: { date: string; senate: Record<string, number>; house: Record<string, number>; senate_seats: number; house_seats: number }[] }>("history.json");
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
