// Replay test: run every pretend night minute by minute and check the rules hold. Run: npm run test:live
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildRows, END, makeScenario, snapshot, winnerSide, type CompactRace, type Drills } from "./demo.ts";
import { liveChamber } from "./live.ts";

const dir = new URL("../public/data/", import.meta.url);
const meta = JSON.parse(readFileSync(new URL("whatif.json", dir), "utf8"));
const bin = readFileSync(new URL("whatif.bin", dir));
const sims = new Int8Array(bin.buffer, bin.byteOffset, bin.byteLength);
const races = JSON.parse(readFileSync(new URL("races.json", dir), "utf8")) as (CompactRace & { margin: Record<string, number | null> })[];
const sched = JSON.parse(readFileSync(new URL("schedule.json", dir), "utf8")).states;
const compact: CompactRace[] = races.map((r) => ({ id: r.id, state: r.state, title: r.title, margin: r.margin?.fundamentals ?? null, incumbent_party: r.incumbent_party, rules: r.rules, district: r.district }));
const rows = buildRows(meta, sims, compact, sched);
const none: Drills = { down: false, manual: false, bad: false, backward: false };
const all: Drills = { down: true, manual: true, bad: true, backward: true };

for (const kind of ["typical", "tight", "wave"] as const) {
  const sc = makeScenario(meta, sims, rows, kind);

  test(`${kind}: no race is ever Decided for the wrong side (no drills, and with every drill on)`, () => {
    let decidedEver = 0;
    for (const drills of [none, all]) {
      for (let t = 0; t <= END; t += 3) {
        for (const r of rows) {
          const s = snapshot(r, sc.finals[r.id], t, drills);
          if (s.decision.state === "decided") {
            decidedEver++;
            assert.equal(s.decision.winner, winnerSide(sc.finals[r.id]), `${r.id} called for the wrong side at t=${t} (final ${sc.finals[r.id].toFixed(1)}, counted ${s.margin?.toFixed(1)})`);
          }
        }
      }
    }
    assert.ok(decidedEver > 0);
  });

  test(`${kind}: nothing is Decided before polls close or under a third counted`, () => {
    for (let t = 0; t <= END; t += 5) for (const r of rows) {
      const s = snapshot(r, sc.finals[r.id], t, none);
      if (t < r.openAt) assert.equal(s.decision.state, "waiting");
      if (s.decision.state === "decided") assert.ok(s.counted >= 0.35 * r.expected);
    }
  });

  test(`${kind}: counted votes only go up on a healthy feed`, () => {
    for (const r of rows.filter((_, i) => i % 7 === 0)) {
      let prev = 0;
      for (let t = 0; t <= END; t++) { const s = snapshot(r, sc.finals[r.id], t, none); assert.ok(s.counted >= prev, `${r.id} went backward at ${t}`); prev = s.counted; }
    }
  });

  test(`${kind}: by 3 AM most fast-counting races are Decided, and live odds agree with the result`, () => {
    let decided = 0, fast = 0, agree = 0, cons = 0;
    for (const r of rows) {
      const s = snapshot(r, sc.finals[r.id], END, none);
      if (r.dur < 400) { fast++; if (s.decision.state === "decided") decided++; }
      if (s.decision.state !== "decided" && (s.p > 0.9 || s.p < 0.1)) { cons++; if ((s.p > 0.5) === (sc.finals[r.id] > 0)) agree++; }
    }
    assert.ok(decided / fast > 0.8, `only ${decided}/${fast} fast races decided by 3 AM`);
    assert.equal(agree, cons);   // confident live odds on undecided races were never on the wrong side
  });

  test(`${kind}: chamber odds, conditioned on Decided races, settle on the true outcome`, () => {
    for (const office of ["s", "h"] as const) {
      const dec: Record<string, "dside" | "rside"> = {};
      for (const r of rows) { const s = snapshot(r, sc.finals[r.id], END, none); if (s.decision.winner) dec[r.id] = s.decision.winner; }
      const res = liveChamber(meta, sims, office, dec, []);
      assert.ok(Number.isFinite(res.D) && res.kept > 0);
    }
  });
}

test("drills: a down feed freezes a state, manual numbers resume it, and nothing else is touched", () => {
  const sc = makeScenario(meta, sims, rows, "typical");
  const pa = rows.find((r) => r.st === "PA" && r.o === "h")!;
  const tx = rows.find((r) => r.st === "TX" && r.o === "h")!;
  const d: Drills = { ...none, down: true };
  assert.equal(snapshot(pa, sc.finals[pa.id], 300, d).feed.status, "stale");
  assert.equal(snapshot(pa, sc.finals[pa.id], 300, d).tEff, 210);
  assert.equal(snapshot(tx, sc.finals[tx.id], 300, d).feed.status, "ok");
  const m = snapshot(pa, sc.finals[pa.id], 400, { ...d, manual: true });
  assert.equal(m.feed.status, "manual");
  assert.ok(m.feed.note?.startsWith("Entered by hand from"));
  assert.ok((m.tEff ?? 0) > 210);
  assert.equal(snapshot(rows.find((r) => r.st === "NV")!, 0, 340, { ...none, bad: true }).feed.status, "error");
});
