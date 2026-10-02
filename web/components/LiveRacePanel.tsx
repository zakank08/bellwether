"use client";
import { decide, liveOdds, type Rule } from "@/lib/live";
import { sideOf, type LiveRace } from "@/lib/livefeed";
import { in100, partyInk, surname } from "@/lib/format";
import { useLive } from "./useLive";

type Side = { name: string | null; party: string | null };
type Props = { raceId: string; title: string; dside: Side; rside: Side; mu0: number | null; sd0: number; rules: Record<string, boolean>; state: string; pBefore: number };

const ago = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "under a minute ago" : m === 1 ? "1 minute ago" : m < 90 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`;
};
const STATE_LABEL: Record<string, string> = { waiting: "No results yet", counting: "Counting", close: "Too close to call", decided: "Decided", runoff: "Runoff if it holds", rcv: "Ranked-choice count later", primary: "All-party primary" };

/** Live results on a race page. Appears only once the site is pointed at the results feed (NEXT_PUBLIC_LIVE_URL); until then it renders nothing.
 * "Decided" follows the rule in lib/live.ts: stricter than a projection, and never attributed to anyone else. */
export default function LiveRacePanel({ raceId, title, dside, rside, mu0, sd0, rules, state, pBefore }: Props) {
  const { results, status, error, on } = useLive();
  if (!on) return null;
  const row: LiveRace | undefined = results?.races.find((r) => r.race_id === raceId);
  const st = status?.states[state];
  const behind = error || st?.state === "stale" || st?.state === "down";
  const hold = results?.holds?.[raceId];

  if (!row) {
    return (
      <section className="block live-panel" aria-labelledby="live-h">
        <h2 id="live-h" className="display">Live results</h2>
        <p className="muted">{results ? "No results for this race yet. They appear here as the state reports them, usually after polls close." : error ? "Can’t reach the live results right now. The forecast above is unchanged." : "Loading live results…"}</p>
      </section>
    );
  }

  const sides = row.cands.map((c) => ({ c, s: sideOf(c, dside, rside) }));
  const sum = (k: "d" | "r" | "o") => sides.filter((x) => x.s === k).reduce((a, x) => a + x.c.votes, 0);
  const dv = sum("d"), rv = sum("r"), ov = sum("o"), total = dv + rv + ov;
  const margin = total ? ((dv - rv) / total) * 100 : 0;
  const f = row.units_total > 0 ? row.units_reporting / row.units_total : 0;
  const rule: Rule = rules.rcv ? "rcv" : rules.runoff ? "runoff" : rules.jungle_nov ? "primary" : "none";
  const expected = f > 0 ? total / f : total;
  let dec = decide({ margin, counted: total, expected, units: f, rule, thirdShare: total ? (ov / total) * 100 : 0, state });
  if (hold) dec = hold.action === "undecided" ? { state: "counting", winner: null, why: `Held open by hand: ${hold.reason}` } : { state: "decided", winner: hold.action === "decided_dside" ? "dside" : "rside", why: `Marked by hand: ${hold.reason}` };
  const odds = mu0 == null ? null : liveOdds(mu0, sd0, total ? { margin, f } : null);
  const leader = dec.winner === "dside" ? dside.name : dec.winner === "rside" ? rside.name : null;
  const rows = [...row.cands].sort((a, b) => b.votes - a.votes);

  return (
    <section className="block live-panel" aria-labelledby="live-h">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 id="live-h" className="display">Live results</h2>
        <span className={`chip demo-${dec.state}`}>{dec.state === "decided" && leader ? `Decided: ${leader}` : STATE_LABEL[dec.state]}</span>
      </div>
      {behind && <p className="small" style={{ background: "var(--signal-soft)", padding: "8px 12px", borderRadius: "var(--radius-md)" }}><strong>Delayed.</strong> We can’t get fresh numbers from {state}’s results site right now, so these are the last we received ({ago(st?.last_success ?? results?.updated)}).</p>}
      {row.by_hand && <p className="small"><span className="chip demo-manual">By hand</span> {row.source}. {row.by_hand}</p>}
      <div className="table-wrap">
        <table className="data cand" style={{ width: "100%", maxWidth: 620 }}>
          <caption className="sr-only">Votes counted so far in {title}</caption>
          <thead><tr><th>Candidate</th><th className="r">Votes</th><th className="r">Share</th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const sd = sideOf(c, dside, rside);
              const won = dec.winner && ((dec.winner === "dside" && sd === "d") || (dec.winner === "rside" && sd === "r"));
              return (
                <tr key={c.name}>
                  <td><span className="pdot" style={{ background: partyInk(c.party as never) }} aria-hidden="true" /> {won && <span className="check" aria-label="Decided">✓ </span>}{c.name}{c.party !== "D" && c.party !== "R" ? <span className="muted"> ({c.party === "O" ? "other" : c.party})</span> : null}</td>
                  <td className="r num">{c.votes.toLocaleString("en-US")}</td>
                  <td className="r num">{total ? ((c.votes / total) * 100).toFixed(1) : "0.0"}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: "8px 0" }}>
        {row.units_total > 0 ? `${row.units_reporting.toLocaleString("en-US")} of ${row.units_total.toLocaleString("en-US")} precincts or counties reporting (${Math.round(f * 100)}%).` : "Share reporting isn’t published for this race."}
        {" "}{total.toLocaleString("en-US")} votes counted. {row.as_of ? `State’s own timestamp: ${new Date(row.as_of).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.` : ""}
      </p>
      <p className="small">{dec.why}.</p>
      {odds && <p style={{ margin: "10px 0 0" }}>Live odds: <strong className="num">{in100(odds.p)} in 100</strong> for {surname(dside.name)}, <strong className="num">{in100(1 - odds.p)} in 100</strong> for {surname(rside.name)} <span className="muted small">(before polls closed: {in100(pBefore)} / {in100(1 - pBefore)})</span></p>}
      <p className="small muted" style={{ marginTop: 10 }}>Source: {row.source_url ? <a href={row.source_url} target="_blank" rel="noopener noreferrer">{row.source}</a> : row.source}. Updated {ago(results?.updated)}. “Decided” is our own rule, based on the votes still to count; it isn’t a projection by any news organization.</p>
    </section>
  );
}
