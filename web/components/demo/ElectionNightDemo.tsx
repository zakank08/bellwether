"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildRows, clock, END, makeScenario, partyOf, SCENARIOS, snapshot, type CompactRace, type Drills, type DemoRow, type Scenario, type SchedRow, type Snap } from "@/lib/demo";
import { liveChamber } from "@/lib/live";
import { in100, surname } from "@/lib/format";
import type { WMeta } from "@/lib/whatif";

type Tab = "all" | "s" | "h";
const SPEEDS = [["Slow", 3], ["Normal", 10], ["Fast", 30]] as const;
const dayLabel = (t: number) => (t >= 360 ? " (Nov. 4)" : "");

function Chip({ s }: { s: Snap }) {
  const d = s.decision;
  const r = s.row;
  if (d.state === "decided") {
    const side = d.winner!;
    return <span className="chip demo-decided">Decided: {surname(side === "dside" ? r.dn : r.rn)} ({partyOf(r, side)})</span>;
  }
  const label = { waiting: s.feed.status === "closed" ? "Polls not closed" : "No results yet", counting: "Counting", close: "Too close to decide", runoff: "Runoff possible", rcv: "Ranked-choice count later", primary: "All-party primary: runoff possible", decided: "" }[d.state];
  return <span className={`chip demo-${d.state}`}>{label}</span>;
}

function FeedChip({ s, t }: { s: Snap; t: number }) {
  const f = s.feed;
  if (f.status === "manual") return <span className="chip demo-manual" title={f.note}>Entered by hand</span>;
  if (f.status === "stale") return <span className="chip demo-warn" title={f.note}>Feed stale · {t - (s.tEff ?? 0)} min</span>;
  if (f.status === "error") return <span className="chip demo-warn" title={f.note}>Bad data from state</span>;
  if (f.status === "review") return <span className="chip demo-warn" title={f.note}>Count went down: flagged</span>;
  return null;
}

function RaceCard({ s, t }: { s: Snap; t: number }) {
  const r = s.row;
  const p = s.p;
  return (
    <div className="demo-card">
      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
        <span className="kicker">{r.o === "s" ? "Senate" : "House"}</span>
        <span className="row" style={{ gap: 6 }}><FeedChip s={s} t={t} /><Chip s={s} /></span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 17, margin: "4px 0 6px" }}>{r.title}</div>
      <div className="row small" style={{ justifyContent: "space-between" }}>
        <span style={{ color: r.dp === "D" ? "var(--dem)" : "var(--ind)" }}>{surname(r.dn)} <strong className="num">{in100(p)}</strong></span>
        <span style={{ color: "var(--rep)" }}><strong className="num">{in100(1 - p)}</strong> {surname(r.rn)}</span>
      </div>
      <div className="bar" style={{ margin: "5px 0" }} aria-hidden="true"><div style={{ width: `${p * 100}%`, background: r.dp === "D" ? "var(--d-safe)" : "var(--ind-fill)" }} /><div style={{ flex: 1, background: "var(--r-safe)" }} /></div>
      {s.margin == null ? <div className="small muted">{s.decision.why}</div> : (
        <>
          <div className="small">Counted: <strong className="num">{s.margin >= 0 ? `${surname(r.dn)} +${s.margin.toFixed(1)}` : `${surname(r.rn)} +${Math.abs(s.margin).toFixed(1)}`}</strong> · <span className="num">{s.counted.toLocaleString("en-US")}</span> votes</div>
          <div className="meter" role="img" aria-label={`About ${Math.round(Math.min(s.f, 1) * 100)}% of the expected vote counted (an estimate)`}><div style={{ width: `${Math.min(s.f, 1) * 100}%` }} /></div>
          <div className="small muted">≈{Math.round(Math.min(s.f, 0.99) * 100)}% of expected vote counted (estimate) · updated {t - (s.tEff ?? t) <= 0 ? "just now" : `${t - (s.tEff ?? t)} min ago`}</div>
          <div className="small muted" style={{ marginTop: 2 }}>{s.decision.why}</div>
        </>
      )}
      {s.feed.note && s.feed.status !== "ok" && <div className="small demo-note">{s.feed.note}</div>}
    </div>
  );
}

function Scoreboard({ office, meta, snaps, ch, base, t }: { office: "s" | "h"; meta: WMeta; snaps: Snap[]; ch: { D: number; R: number; C: number; ess: number } | null; base: { D: number; R: number }; t: number }) {
  const total = office === "s" ? 100 : 435;
  const maj = office === "s" ? 51 : 218;
  const nuD = office === "s" ? meta.senate_not_up.D + meta.senate_not_up.I_caucus_D : 0;
  const nuR = office === "s" ? meta.senate_not_up.R : 0;
  let decD = 0, decR = 0, leadD = 0, leadR = 0, waiting = 0, other = 0;
  for (const s of snaps) {
    if (s.row.o !== office) continue;
    if (s.decision.state === "decided") { const p = partyOf(s.row, s.decision.winner!); if (p === "D") decD++; else if (p === "R") decR++; else other++; }
    else if (s.margin == null) waiting++;
    else if (s.margin >= 0) (s.row.dp === "D" ? leadD++ : other++); else (s.row.rp === "R" ? leadR++ : other++);
  }
  const rest = total - nuD - nuR - decD - decR - leadD - leadR;
  const w = (n: number) => `${(n / total) * 100}%`;
  const D = ch ? ch.D : base.D, R = ch ? ch.R : base.R;
  return (
    <div className="demo-panel">
      <div className="kicker">{office === "s" ? "Senate" : "House"}</div>
      <div className="row" style={{ gap: 20, alignItems: "baseline" }}>
        <span className="display" style={{ fontSize: 40, color: "var(--dem)" }}>{in100(D)}<small style={{ fontSize: 16 }}> in 100 D</small></span>
        <span className="display" style={{ fontSize: 40, color: "var(--rep)" }}>{in100(R)}<small style={{ fontSize: 16 }}> in 100 R</small></span>
      </div>
      <div className="small muted">Chance of control right now (before polls closed: {in100(base.D)} D / {in100(base.R)} R){ch && ch.ess < 30 ? " · few simulations match the count so far" : ""}</div>
      <div className="seatbar" role="img" aria-label={`${office === "s" ? "Senate" : "House"}: ${decD + nuD} Democratic seats decided or not up, ${decR + nuR} Republican; ${leadD} more leading for Democrats, ${leadR} for Republicans`}>
        <i style={{ width: w(nuD), background: "var(--d-lean)" }} /><i style={{ width: w(decD), background: "var(--d-safe)" }} /><i style={{ width: w(leadD), background: "var(--d-likely)", opacity: 0.55 }} />
        <i style={{ width: w(Math.max(rest, 0)), background: "var(--uncalled)" }} />
        <i style={{ width: w(leadR), background: "var(--r-likely)", opacity: 0.55 }} /><i style={{ width: w(decR), background: "var(--r-safe)" }} /><i style={{ width: w(nuR), background: "var(--r-lean)" }} />
        <b style={{ left: w(maj) }} aria-hidden="true" />
      </div>
      <div className="small demo-legend">
        <span><strong className="num">{decD + nuD}</strong> D decided{office === "s" ? ` (incl. ${nuD} not up)` : ""}</span>
        <span><strong className="num">{leadD}</strong> D leading</span>
        <span><strong className="num">{Math.max(rest, 0)}</strong> not in yet</span>
        <span><strong className="num">{leadR}</strong> R leading</span>
        <span><strong className="num">{decR + nuR}</strong> R decided{office === "s" ? ` (incl. ${nuR} not up)` : ""}</span>
      </div>
      <div className="small muted">{maj} needed for control{office === "s" ? " (a 50–50 Senate goes to the vice president, a Republican)" : ""}. “Decided” means the uncounted vote can’t overturn the lead; “leading” does not.{t < 0 ? "" : ""}</div>
    </div>
  );
}

export default function ElectionNightDemo({ compact, schedule }: { compact: CompactRace[]; schedule: SchedRow[] }) {
  const [meta, setMeta] = useState<WMeta | null>(null);
  const [sims, setSims] = useState<Int8Array | null>(null);
  const [err, setErr] = useState(false);
  const [kind, setKind] = useState<Scenario["kind"]>("typical");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [drills, setDrills] = useState<Drills>({ down: false, manual: false, bad: false, backward: false });
  const [tab, setTab] = useState<Tab>("all");
  useEffect(() => {
    Promise.all([fetch("/data/whatif.json").then((r) => r.json()), fetch("/data/whatif.bin").then((r) => r.arrayBuffer())])
      .then(([m, b]) => { setMeta(m); setSims(new Int8Array(b)); }).catch(() => setErr(true));
  }, []);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((x) => { const n = x + speed * 0.25; if (n >= END) { setPlaying(false); return END; } return n; }), 250);
    return () => clearInterval(id);
  }, [playing, speed]);

  const rows = useMemo(() => (meta && sims ? buildRows(meta, sims, compact, schedule) : null), [meta, sims, compact, schedule]);
  const sc = useMemo(() => (meta && sims && rows ? makeScenario(meta, sims, rows, kind) : null), [meta, sims, rows, kind]);
  const tm = Math.floor(t);
  const snaps = useMemo(() => (rows && sc ? rows.map((r) => snapshot(r, sc.finals[r.id], tm, drills)) : null), [rows, sc, tm, drills]);
  const chambers = useMemo(() => {
    if (!meta || !sims || !snaps) return null;
    const out = {} as Record<"s" | "h", { D: number; R: number; C: number; ess: number }>;
    for (const o of ["s", "h"] as const) {
      const decided: Record<string, "dside" | "rside"> = {};
      const soft: { id: string; margin: number; sd: number }[] = [];
      for (const s of snaps) {
        if (s.row.o !== o) continue;
        if (s.decision.winner) decided[s.row.id] = s.decision.winner;
        else if (s.margin != null && s.f >= 0.1) soft.push({ id: s.row.id, margin: s.margin, sd: Math.hypot(8 * (1 - Math.min(s.f, 1)), 0.5) + 2 });
      }
      out[o] = liveChamber(meta, sims, o, decided, soft);
    }
    return out;
  }, [meta, sims, snaps]);
  const base = useMemo(() => {
    if (!meta || !sims) return null;
    return { s: liveChamber(meta, sims, "s", {}, []), h: liveChamber(meta, sims, "h", {}, []) };
  }, [meta, sims]);

  if (err) return <p role="alert" style={{ padding: "32px 0" }}>The simulation file didn’t load. Refresh to try again.</p>;
  if (!meta || !rows || !sc || !snaps || !base || !chambers) return <p className="muted" style={{ padding: "32px 0" }}>Loading the rehearsal…</p>;

  const open = snaps.filter((s) => s.feed.tEff != null && s.f >= 0.04 && s.decision.state !== "decided" && (tab === "all" || s.row.o === tab));
  const watch = [...open].sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5) || (a.row.o === "s" ? -1 : 1)).slice(0, 12);
  const decidedNow = snaps.filter((s) => s.decision.state === "decided");
  const flips = decidedNow.filter((s) => s.row.holder && partyOf(s.row, s.decision.winner!) !== s.row.holder);
  const flipTo = (p: string) => flips.filter((s) => partyOf(s.row, s.decision.winner!) === p).length;
  const byState = new Map<string, Snap[]>();
  for (const s of snaps) (byState.get(s.row.st) ?? byState.set(s.row.st, []).get(s.row.st)!).push(s);
  const states = [...byState.entries()].map(([st, ss]) => {
    const r0 = ss[0].row;
    const decided = ss.every((s) => s.decision.state === "decided");
    const any = ss.some((s) => s.feed.tEff != null);
    const bad = ss.find((s) => ["stale", "error", "review", "manual"].includes(s.feed.status));
    return { st, openAt: r0.openAt, decided, any, bad, n: ss.length, nDec: ss.filter((s) => s.decision.state === "decided").length };
  }).sort((a, b) => a.openAt - b.openAt || a.st.localeCompare(b.st));
  const hours = new Map<number, typeof states>();
  for (const s of states) { const h = Math.floor(s.openAt / 60); (hours.get(h) ?? hours.set(h, []).get(h)!).push(s); }
  const unhealthy = states.filter((s) => s.bad);
  const toggle = (k: keyof Drills) => setDrills((d) => ({ ...d, [k]: !d[k], ...(k === "down" && d.down ? { manual: false } : {}) }));

  return (
    <div>
      <div className="demo-controls">
        <div className="wrap row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <strong className="num demo-clock" aria-live="off">{clock(tm)} ET<small>{dayLabel(tm)}</small></strong>
          <button className="btn" onClick={() => { if (t >= END) setT(0); setPlaying((p) => !p); }} aria-pressed={playing}>{playing ? "Pause" : t >= END ? "Replay" : t > 0 ? "Resume" : "Start the night"}</button>
          <label className="sr-only" htmlFor="scrub">Time of night</label>
          <input id="scrub" type="range" min={0} max={END} step={1} value={tm} onChange={(e) => { setPlaying(false); setT(+e.target.value); }} style={{ flex: "1 1 220px", minWidth: 160 }} />
          <div className="toggle" role="group" aria-label="Speed">{SPEEDS.map(([l, v]) => <button key={l} aria-pressed={speed === v} onClick={() => setSpeed(v)}>{l}</button>)}</div>
        </div>
      </div>

      <div className="wrap">
        <section className="block" style={{ paddingTop: 16 }}>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <label className="small" htmlFor="scen"><strong>Pretend outcome</strong></label>
            <select id="scen" className="demo-select" value={kind} onChange={(e) => { setKind(e.target.value as Scenario["kind"]); }}>
              {(Object.keys(SCENARIOS) as Scenario["kind"][]).map((k) => <option key={k} value={k}>{SCENARIOS[k]}</option>)}
            </select>
            <span className="small muted">One of the forecast’s own simulated outcomes, released the way a night unfolds.</span>
          </div>
          <fieldset className="demo-drills">
            <legend className="small"><strong>Break something</strong> (failure drills)</legend>
            <label><input type="checkbox" checked={drills.down} onChange={() => toggle("down")} /> Pennsylvania’s feed goes down at 9:30 PM</label>
            <label><input type="checkbox" checked={drills.manual} disabled={!drills.down} onChange={() => toggle("manual")} /> …and I enter Pennsylvania by hand from 11:30 PM</label>
            <label><input type="checkbox" checked={drills.bad} onChange={() => toggle("bad")} /> Nevada sends unreadable data, 11:30 PM–12:30 AM</label>
            <label><input type="checkbox" checked={drills.backward} onChange={() => toggle("backward")} /> Georgia’s count goes backward at 11:00 PM</label>
          </fieldset>
        </section>

        <section className="block" aria-labelledby="board-h">
          <h2 id="board-h" className="display">Who is on track to control Congress</h2>
          <div className="demo-grid">
            <Scoreboard office="s" meta={meta} snaps={snaps} ch={tm > 0 ? chambers.s : null} base={base.s} t={tm} />
            <Scoreboard office="h" meta={meta} snaps={snaps} ch={tm > 0 ? chambers.h : null} base={base.h} t={tm} />
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>Governors’ races are not in this rehearsal (the simulation file covers Senate and House). Control odds use the forecast’s correlated simulations, keeping only those that match the races already decided.</p>
        </section>

        <section className="block" aria-labelledby="flip-h">
          <h2 id="flip-h" className="display">Seats that have changed parties</h2>
          <p className="takeaway">
            <span className="flip-chip">{flips.length} decided flips</span> <span className="muted">to D {flipTo("D")} · to R {flipTo("R")}</span>
          </p>
          {flips.length === 0 ? <p className="small muted">None decided yet.</p> : (
            <ul className="flip-list">{flips.slice(0, 14).map((s) => (
              <li key={s.row.id}><strong>{s.row.title}</strong> <span className="chip small">{s.row.o === "s" ? "Senate" : "House"}</span>
                <span className="flip-chip">{s.row.holder} → {partyOf(s.row, s.decision.winner!)}</span></li>
            ))}{flips.length > 14 && <li className="small muted">and {flips.length - 14} more</li>}</ul>
          )}
        </section>

        <section className="block" aria-labelledby="watch-h">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id="watch-h" className="display">Races to watch now</h2>
            <div className="toggle" role="group" aria-label="Which races">
              {([["all", "All"], ["s", "Senate"], ["h", "House"]] as const).map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
            </div>
          </div>
          <p className="takeaway small">Not-yet-decided races with at least a few percent counted, closest first.</p>
          {watch.length === 0 ? <p className="muted">{tm === 0 ? "Press “Start the night”. Polls begin closing at 6 PM." : "No open races with results yet."}</p> : <div className="demo-cards">{watch.map((s) => <RaceCard key={s.row.id} s={s} t={tm} />)}</div>}
        </section>

        <section className="block" aria-labelledby="time-h">
          <h2 id="time-h" className="display">Polls closing</h2>
          <div className="demo-timeline">
            {[...hours.entries()].sort((a, b) => a[0] - b[0]).map(([h, ss]) => (
              <div key={h} className="demo-hour">
                <div className="small muted">{clock(h * 60)}</div>
                <div className="demo-states">{ss.map((s) => (
                  <span key={s.st} className={`demo-state ${s.decided ? "done" : s.any ? "live" : tm >= s.openAt ? "wait" : ""}${s.bad ? " bad" : ""}`} title={`${s.st}: ${s.nDec} of ${s.n} races decided`}>{s.st}</span>
                ))}</div>
              </div>
            ))}
          </div>
          <p className="small muted">Gray: polls not closed · outlined: closed, no results · blue-gray: results coming in · solid: every race in the state decided · amber ring: a feed problem.</p>
        </section>

        <section className="block" aria-labelledby="feed-h">
          <h2 id="feed-h" className="display">State feed health</h2>
          <p className="takeaway small"><strong className="num">{states.filter((s) => s.any).length - unhealthy.length}</strong> of {states.filter((s) => s.any).length} reporting states are updating normally{unhealthy.length ? `; ${unhealthy.length} need${unhealthy.length === 1 ? "s" : ""} attention` : ""}.</p>
          {unhealthy.length === 0 ? <p className="small muted">Nothing needs attention. Turn on a failure drill above and watch this list.</p> : (
            <ul className="plain">{unhealthy.map((s) => <li key={s.st}><strong>{s.st}</strong>: {s.bad!.feed.note}</li>)}</ul>
          )}
        </section>

        <section className="block" aria-labelledby="how-h">
          <h2 id="how-h" className="display">How to read this</h2>
          <ul className="plain">
            <li><strong>Decided</strong> appears only when the vote still uncounted, with generous safety margins, cannot overturn the lead. Under a third of the expected vote, or a lead under one point, is never Decided. It is our own rule; it is never attributed to anyone else and it is not a “projected winner.”</li>
            <li><strong>Live odds</strong> start from the pre-election forecast and move toward the count as more is in, because early counts can lean differently from the final result.</li>
            <li><strong>% of expected vote</strong> is an estimate from turnout, so it can differ from what is really left.</li>
            <li><strong>Georgia</strong> goes to a runoff if nobody tops 50%; <strong>Maine</strong> and <strong>Alaska</strong> show first-round counts, with the ranked-choice count later; <strong>Louisiana’s</strong> House races on Nov. 3 are an all-party primary.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
