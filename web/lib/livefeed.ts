/** Shapes of the two files the election-night worker writes (pipeline/bellwether/results). Client-safe: no file access. */
export type LiveCand = { name: string; party: string; votes: number };
export type LiveRace = {
  race_id: string; state: string; cands: LiveCand[]; total: number;
  units_reporting: number; units_total: number; source: string; source_url?: string; as_of?: string | null; by_hand?: string | null;
  counties?: Record<string, [number, number, number]>;   // county name -> [Democratic, Republican, other]
};
export type LiveResults = { updated: string | null; races: LiveRace[]; holds?: Record<string, { action: "undecided" | "decided_dside" | "decided_rside"; reason: string }> };
export type LiveStatus = { updated: string | null; publish_every_s?: number; states: Record<string, { state: "ok" | "partial" | "stale" | "down" | "paused"; last_success: string | null; message?: string; rejected?: { race_id: string; why: string }[] }>; by_hand?: string[]; override_errors?: string[] };

/** Where the worker publishes. With Cloudflare storage set up (NEXT_PUBLIC_LIVE_URL) numbers refresh every ~15 seconds; without it the worker
 * commits the files into the site itself and they refresh when the site redeploys (every 10 to 30 minutes). */
export const LIVE_BASE = process.env.NEXT_PUBLIC_LIVE_URL || "/data/live";
export const LIVE_POLL_MS = process.env.NEXT_PUBLIC_LIVE_URL ? 15000 : 45000;

/** The side of a race a candidate belongs to: by surname against the two named sides first, then by party letter. */
export function sideOf(c: LiveCand, d: { name: string | null; party: string | null }, r: { name: string | null; party: string | null }): "d" | "r" | "o" {
  const last = (s: string | null | undefined) => (s ?? "").replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i, "").trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  const cl = last(c.name);
  if (cl && cl === last(d.name)) return "d";
  if (cl && cl === last(r.name)) return "r";
  return c.party === "D" ? "d" : c.party === "R" ? "r" : "o";
}
