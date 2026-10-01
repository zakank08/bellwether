import type { Version } from "./types";

/** Which seats are likely to change parties. A seat "flips" when the party favored to win it is not the
 * party that holds it today. Works the same in both directions; no side is treated as the default. */
type Side = { name: string | null; party: string | null };
export type FlipRow = {
  office: string; state: string; kind: string; incumbent_party: string | null;
  dside: Side; rside: Side; p: Record<Version, number>;
};
export type Flip = { tier: "likely" | "could"; p: number; from: "D" | "R"; to: string };

export const LIKELY_AT = 0.5;   // 50 in 100 or better to change hands
export const COULD_AT = 0.25;   // 25 to 49 in 100

/** States that drew new House maps for 2026; "held today" is the sitting member's party, on old lines. */
export const REDRAWN = new Set(["AL", "CA", "FL", "LA", "MO", "NC", "OH", "TN", "TX", "UT"]);
export const isRedrawnHouse = (r: Pick<FlipRow, "office" | "state">) => r.office === "house" && REDRAWN.has(r.state);

export function flipOf(r: FlipRow, v: Version): Flip | null {
  if (r.kind !== "two_party") return null;
  const h = r.incumbent_party;
  if (h !== "D" && h !== "R") return null;
  const p = r.p[v];
  const holds = (r.dside.party === h ? p : 0) + (r.rside.party === h ? 1 - p : 0);
  const pf = 1 - holds;
  if (pf < COULD_AT) return null;
  const challenger = h === "D" ? r.rside.party : r.dside.party;
  return { tier: pf >= LIKELY_AT ? "likely" : "could", p: pf, from: h, to: challenger ?? "?" };
}

export const flipShort = (f: Flip) => `${f.tier === "likely" ? "Likely flip" : "Could flip"} · ${f.from} → ${f.to}`;

const NAME: Record<string, string> = { D: "Democrats", R: "Republicans", I: "an independent", L: "a Libertarian", G: "a Green", O: "another party" };
export const flipLong = (f: Flip, n100: (p: number) => string, redrawn = false) =>
  `${NAME[f.from]} hold this seat today (${redrawn ? "the sitting member’s party; the lines are new" : "current holder"}); ${NAME[f.to] ?? f.to} ${f.tier === "likely" ? "are favored" : "have a real chance"}: ${n100(f.p)} in 100 that it changes hands.`;

export type FlipTally = { likely: number; could: number; likelyToD: number; likelyToR: number; likelyToOther: number };
export function tally(rows: FlipRow[], v: Version): FlipTally {
  const t: FlipTally = { likely: 0, could: 0, likelyToD: 0, likelyToR: 0, likelyToOther: 0 };
  for (const r of rows) {
    const f = flipOf(r, v);
    if (!f) continue;
    if (f.tier === "could") { t.could++; continue; }
    t.likely++;
    if (f.to === "D") t.likelyToD++; else if (f.to === "R") t.likelyToR++; else t.likelyToOther++;
  }
  return t;
}
