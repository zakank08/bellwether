/** Election-night logic: how much of a race is counted, what the live odds are, and when a race is "Decided".
 * Pure functions with no React and no imports at runtime, so the same code can run against a real results
 * feed on Nov. 3 and against the rehearsal demo. Margins are Democratic-side minus Republican-side points. */
import type { WMeta } from "./whatif.ts";

export type Rule = "none" | "runoff" | "rcv" | "primary";

// ---- small math ---------------------------------------------------------------
export function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26, max error 1.5e-7
  const s = x < 0 ? -1 : 1, a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
export const normCdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

/** Share of a race's expected vote that has been counted `t` minutes after midnight-of-the-night-start,
 * for a race that starts reporting at `start` and would finish at `start + dur`. S-shaped: a few early
 * results, the bulk in the middle, a slow tail. */
export function reportingFraction(t: number, start: number, dur: number): number {
  const x = Math.min(1, Math.max(0, (t - start) / dur));
  const u = Math.pow(x, 0.85);
  return u * u * (3 - 2 * u);
}

// ---- live odds ----------------------------------------------------------------
/** Start from the pre-election forecast (mean `mu0`, spread `sd0`). A counted margin is a noisy view of the
 * final margin: the uncounted vote can lean differently, so the noise shrinks as more is counted. */
export function liveOdds(mu0: number, sd0: number, obs: { margin: number; f: number } | null, lateLeanSd = 8, floor = 0.5) {
  if (!obs || obs.f < 0.02) return { mu: mu0, sd: sd0, p: normCdf(mu0 / sd0) };
  const sdObs = Math.hypot(lateLeanSd * (1 - Math.min(obs.f, 1)), floor);
  const w0 = 1 / (sd0 * sd0), w1 = 1 / (sdObs * sdObs);
  const sd = Math.sqrt(1 / (w0 + w1));
  const mu = (mu0 * w0 + obs.margin * w1) / (w0 + w1);
  return { mu, sd, p: normCdf(mu / sd) };
}

// ---- "Decided" ----------------------------------------------------------------
export type Decision = { state: "waiting" | "counting" | "close" | "decided" | "runoff" | "rcv" | "primary"; winner: "dside" | "rside" | null; why: string };

export const DECIDE = {
  minCountedOfExpected: 0.35,   // never decided before this much of the expected vote is in
  minUnits: 0.5,                // ... or before this share of reporting units (precincts) has reported
  expectedCushion: 1.10,        // the expected total vote could be 10% low
  trailingCeiling: 25,          // the uncounted vote could favor the trailing side by up to 25 points
  closeBand: 1.0,               // a lead under 1 point is never "decided" (recount range)
};

/** A race is Decided only when the votes still to count, with generous safety margins, cannot overturn the
 * lead. This is deliberately stricter than a projection: no race is called on a hunch, and nothing here is
 * attributed to anyone else. */
export function decide(a: { margin: number; counted: number; expected: number; units: number; rule?: Rule; thirdShare?: number }): Decision {
  if (a.counted <= 0) return { state: "waiting", winner: null, why: "No results yet" };
  if (a.counted < DECIDE.minCountedOfExpected * a.expected || a.units < DECIDE.minUnits)
    return { state: "counting", winner: null, why: "Too early: less than a third of the expected vote is counted" };
  const side = a.margin >= 0 ? "dside" : "rside";
  const leaderShare = (100 - (a.thirdShare ?? 0) + Math.abs(a.margin)) / 2;
  if (a.rule === "runoff" && leaderShare <= 50) return { state: "runoff", winner: null, why: "Nobody is above 50%, so this goes to a runoff if it holds" };
  if (a.rule === "rcv" && leaderShare <= 50) return { state: "rcv", winner: null, why: "Ranked-choice race: first-round counts only; the ranked-choice count comes later" };
  if (a.rule === "primary" && leaderShare <= 50) return { state: "primary", winner: null, why: "All-party primary: the top two advance to a runoff unless someone passes 50%" };
  if (Math.abs(a.margin) < DECIDE.closeBand) return { state: "close", winner: null, why: "Within one point: stays open" };
  const lead = (Math.abs(a.margin) / 100) * a.counted;
  const remaining = Math.max(0, DECIDE.expectedCushion * a.expected - a.counted);
  const could = remaining * (DECIDE.trailingCeiling / 100);
  if (lead > could) return { state: "decided", winner: side, why: `Lead of ${Math.round(lead).toLocaleString("en-US")} votes is larger than the ${Math.round(could).toLocaleString("en-US")} the uncounted vote could shift` };
  return { state: "counting", winner: null, why: `Leading, but the uncounted vote could still shift up to ${Math.round(could).toLocaleString("en-US")} votes (lead: ${Math.round(lead).toLocaleString("en-US")})` };
}

// ---- chamber control, conditioned on what is known ------------------------------
/** Chance each party controls a chamber right now. Uses the forecast's own correlated simulations: keep the draws
 * where every Decided race went the way it was decided, and weight the rest by how well each draw's final
 * margins match the counts so far (tempered, so a few races can't dominate). */
export function liveChamber(
  meta: WMeta, sims: Int8Array, office: "s" | "h",
  decided: Record<string, "dside" | "rside">,
  soft: { id: string; margin: number; sd: number }[], tau = 0.3,
) {
  const { n, k } = meta, off = meta.offset ?? 0, scale = meta.scale;
  const byId = new Map(meta.races.map((r) => [r.id, r]));
  const hard: [number, number][] = [];
  const fixed = { D: 0, R: 0 };
  for (const r of meta.races) {
    if (r.o !== office) continue;
    const d = decided[r.id];
    if (r.c == null) {
      const party = d ? (d === "dside" ? r.dp : r.rp) : r.w;
      if (party === "D") fixed.D++; else if (party === "R") fixed.R++;
    } else if (d) hard.push([r.c, d === "dside" ? 1 : -1]);
  }
  const hardIds = new Set(Object.keys(decided));
  const softUse = soft.filter((s) => !hardIds.has(s.id)).map((s) => ({ c: byId.get(s.id)?.c, m: s.margin, sd: s.sd })).filter((s): s is { c: number; m: number; sd: number } => s.c != null);
  const simRaces = meta.races.filter((r) => r.o === office && r.c != null);
  const out = { D: 0, R: 0, C: 0, ess: 0, kept: 0 };
  let wsum = 0, w2 = 0;
  for (let i = 0; i < n; i++) {
    const base = i * k;
    let ok = true;
    for (const [c, sg] of hard) { const m = (sims[base + c] + off) * scale; if ((m > 0 ? 1 : -1) !== sg) { ok = false; break; } }
    if (!ok) continue;
    let logw = 0;
    for (const s of softUse) { const m = (sims[base + s.c] + off) * scale; const z = (m - s.m) / s.sd; logw -= 0.5 * z * z * tau; }
    const w = Math.exp(logw);
    let d = fixed.D, r = fixed.R;
    for (const rc of simRaces) {
      const dWin = (sims[base + rc.c!] + off) * scale > 0;
      const party = dWin ? rc.dp : rc.rp;
      if (party === "D") d++; else if (party === "R") r++;
    }
    if (office === "s") { d += meta.senate_not_up.D + meta.senate_not_up.I_caucus_D; r += meta.senate_not_up.R; }
    const maj = office === "s" ? meta.senate_majority : meta.house_majority;
    const rNeed = office === "s" && meta.vp === "R" ? maj - 1 : maj;
    if (d >= maj) out.D += w; else if (r >= rNeed) out.R += w; else out.C += w;
    wsum += w; w2 += w * w; out.kept++;
  }
  if (wsum <= 0) return { D: NaN, R: NaN, C: NaN, ess: 0, kept: 0 };
  out.ess = (wsum * wsum) / w2;
  return { D: out.D / wsum, R: out.R / wsum, C: out.C / wsum, ess: out.ess, kept: out.kept };
}
