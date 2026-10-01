// Run: cd web && npm run test:live   (Node's built-in test runner; no extra packages)
import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, liveChamber, liveOdds, normCdf, reportingFraction } from "./live.ts";

test("normal CDF is right at known points", () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normCdf(-1) - 0.1587) < 1e-3);
});

test("reporting curve starts at 0, ends at 1, never goes backward", () => {
  let prev = -1;
  for (let t = 0; t <= 400; t += 5) { const f = reportingFraction(t, 60, 240); assert.ok(f >= prev); assert.ok(f >= 0 && f <= 1); prev = f; }
  assert.equal(reportingFraction(0, 60, 240), 0);
  assert.equal(reportingFraction(400, 60, 240), 1);
});

test("live odds start at the forecast and move toward the count as more is counted", () => {
  const pre = liveOdds(2, 6, null);
  assert.ok(Math.abs(pre.p - normCdf(2 / 6)) < 1e-9);
  const early = liveOdds(2, 6, { margin: -10, f: 0.05 });   // a bad early count barely moves it
  const late = liveOdds(2, 6, { margin: -10, f: 0.9 });     // the same count with 90% in moves it a lot
  assert.ok(early.p > late.p);
  assert.ok(late.p < 0.05);
  assert.ok(liveOdds(2, 6, { margin: 2, f: 0.9 }).sd < pre.sd);   // uncertainty shrinks
});

test("a race is not Decided early, however big the lead", () => {
  const d = decide({ margin: 30, counted: 10_000, expected: 400_000, units: 0.1 });
  assert.equal(d.state, "counting");
  assert.equal(d.winner, null);
});

test("Decided needs the lead to beat what the uncounted vote could shift", () => {
  // 60% counted of 400k, lead 6 points: lead = 14,400; remaining = 1.1*400k - 240k = 200k; could shift 50k -> not decided
  const a = decide({ margin: 6, counted: 240_000, expected: 400_000, units: 0.6 });
  assert.equal(a.state, "counting");
  // 95% counted, same margin: lead = 22,800; remaining = 60k; could shift 15k -> decided
  const b = decide({ margin: 6, counted: 380_000, expected: 400_000, units: 0.95 });
  assert.equal(b.state, "decided");
  assert.equal(b.winner, "dside");
  assert.equal(decide({ margin: -6, counted: 380_000, expected: 400_000, units: 0.95 }).winner, "rside");
});

test("within one point is never Decided, even with everything counted", () => {
  assert.equal(decide({ margin: 0.6, counted: 400_000, expected: 400_000, units: 1 }).state, "close");
  assert.equal(decide({ margin: -0.9, counted: 400_000, expected: 400_000, units: 1 }).state, "close");
});

test("special rules: runoff, ranked-choice and all-party primary hold off a call below 50%", () => {
  const base = { margin: 8, counted: 395_000, expected: 400_000, units: 1 };
  assert.equal(decide({ ...base, rule: "runoff", thirdShare: 6 }).state, "decided");   // leader has (100-6+8)/2 = 51%
  assert.equal(decide({ ...base, rule: "runoff", thirdShare: 12 }).state, "runoff");   // leader has 48%
  assert.equal(decide({ ...base, rule: "rcv", thirdShare: 12 }).state, "rcv");
  assert.equal(decide({ ...base, rule: "primary", thirdShare: 30 }).state, "primary");
  assert.equal(decide({ ...base, rule: "none", thirdShare: 12 }).state, "decided");
});

// Two competitive House races (a, b), four simulated draws, D needs both for a 2-seat majority.
const meta = {
  n: 4, k: 2, scale: 0.5, offset: 0.5,
  races: [
    { id: "a", o: "h", st: "X", d: 1, t: "A", dn: "d", dp: "D", rn: "r", rp: "R", c: 0 },
    { id: "b", o: "h", st: "X", d: 2, t: "B", dn: "d", dp: "D", rn: "r", rp: "R", c: 1 },
  ],
  senate_not_up: { D: 0, R: 0, I_caucus_D: 0 }, senate_majority: 51, house_majority: 2, vp: "R", asof: "",
};
const sims = new Int8Array([20, 20, 20, -20, -20, 20, -20, -20]);   // draws: (D,D) (D,R) (R,D) (R,R)

test("chamber odds with nothing known are the plain share of draws", () => {
  const r = liveChamber(meta as never, sims, "h", {}, []);
  assert.equal(r.D, 0.25);
  assert.equal(r.R, 0.25);   // both Republican
  assert.equal(r.C, 0.5);    // split: nobody reaches 2
});

test("chamber odds keep only the draws consistent with Decided races", () => {
  assert.equal(liveChamber(meta as never, sims, "h", { a: "dside" }, []).D, 0.5);
  assert.equal(liveChamber(meta as never, sims, "h", { a: "dside", b: "dside" }, []).D, 1);
  assert.equal(liveChamber(meta as never, sims, "h", { a: "rside", b: "rside" }, []).R, 1);
});

test("a leading-but-not-decided race tilts the odds without removing any draws", () => {
  const r = liveChamber(meta as never, sims, "h", {}, [{ id: "a", margin: 8, sd: 3 }], 1);
  assert.equal(r.kept, 4);
  assert.ok(r.D > 0.25 && r.D < 0.5);
});
