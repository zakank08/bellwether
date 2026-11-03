/** Turns the worker's live.json into the same `Snap` objects the rehearsal uses, so the real election-night page can reuse the
 * rehearsal's scoreboard, maps and tables. Pure functions (no React) so they can be tested with Node. Time is minutes after
 * 6:00 PM Eastern on Nov. 3 (23:00 UTC), like the rehearsal. */
import { decide, liveOdds } from "./live.ts";
import type { DemoRow, Snap } from "./demo.ts";
import { sideOf, type LiveResults, type LiveStatus } from "./livefeed.ts";

export const NIGHT_START_UTC = Date.parse("2026-11-03T23:00:00Z");
export const minutesSinceStart = (ms: number) => (ms - NIGHT_START_UTC) / 60000;

export function liveSnaps(rows: DemoRow[], results: LiveResults | null, status: LiveStatus | null, nowMs: number): Snap[] {
  const now = minutesSinceStart(nowMs);
  const byId = new Map((results?.races ?? []).map((r) => [r.race_id, r]));
  return rows.map((row): Snap => {
    const lr = byId.get(row.id);
    const st = status?.states[row.st];
    const hold = results?.holds?.[row.id];
    if (!lr || !lr.cands.length) {
      const o = liveOdds(row.mu0, row.sd0, null);
      const closed = now < row.openAt;
      return { row, feed: { tEff: null, status: closed ? "closed" : "waiting" }, f: 0, counted: 0, units: 0, margin: null,
        decision: { state: "waiting", winner: null, why: closed ? "Polls not closed yet" : "Polls closed; no results yet" }, p: o.p, mu: o.mu, sd: o.sd, tEff: null };
    }
    const d = { name: row.dn, party: row.dp }, r = { name: row.rn, party: row.rp };
    let dv = 0, rv = 0, ov = 0;
    for (const c of lr.cands) { const s = sideOf(c, d, r); if (s === "d") dv += c.votes; else if (s === "r") rv += c.votes; else ov += c.votes; }
    const total = dv + rv + ov;
    const margin = total > 0 ? ((dv - rv) / total) * 100 : 0;
    const units = lr.units_total > 0 ? Math.min(1, lr.units_reporting / lr.units_total) : 0;
    const expected = units > 0 ? total / units : total;
    let decision = decide({ margin, counted: total, expected, units, rule: row.rule, thirdShare: total ? (ov / total) * 100 : 0, state: row.st });
    if (hold) decision = hold.action === "undecided"
      ? { state: "counting", winner: null, why: `Held open by hand: ${hold.reason}` }
      : { state: "decided", winner: hold.action === "decided_dside" ? "dside" : "rside", why: `Marked by hand: ${hold.reason}` };
    const odds = liveOdds(row.mu0, row.sd0, total > 0 ? { margin, f: units } : null);
    const p = decision.winner === "dside" ? 1 : decision.winner === "rside" ? 0 : odds.p;
    const stamp = st?.state === "stale" || st?.state === "down" ? st.last_success : status?.updated ?? results?.updated ?? null;
    const tEff = stamp ? minutesSinceStart(Date.parse(stamp)) : now;
    const rej = st?.rejected?.find((x) => x.race_id === row.id);
    const feed: Snap["feed"] = lr.by_hand
      ? { tEff, status: "manual", note: `${lr.source}. ${lr.by_hand}` }
      : st?.state === "stale" || st?.state === "down"
        ? { tEff, status: "stale", note: "No new numbers from the state’s feed; showing the last we received" }
        : rej ? { tEff, status: "review", note: `New numbers were refused (${rej.why}); showing the last good numbers` }
        : { tEff, status: "ok" };
    return { row, feed, f: units, counted: total, units, margin, decision, p, mu: odds.mu, sd: odds.sd, tEff, votes: { d: dv, r: rv, o: ov } };
  });
}
