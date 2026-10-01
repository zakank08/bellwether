"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildRows, candidateVotes, clock, END, makeScenario, mapStatus, partyOf, SCENARIOS, snapshot, type CompactRace, type Drills, type Scenario, type SchedRow, type Snap } from "@/lib/demo";
import { in100, surname } from "@/lib/format";
import { liveChamber } from "@/lib/live";
import type { WMeta } from "@/lib/whatif";
import { TipProvider } from "@/components/Tooltip";
import { DemoHexMap, DemoStateMap, fillFor, flipOfSnap, MapLegend } from "./DemoMaps";

const SPEEDS = [["Slow", 3], ["Normal", 10], ["Fast", 30]] as const;
const dayLabel = (t: number) => (t >= 360 ? " · Nov. 4" : "");
type Chamber = { D: number; R: number; C: number; ess: number };

function Status({ s }: { s: Snap }) {
  const d = s.decision, r = s.row;
  if (d.state === "decided") return <span className="chip demo-decided">✓ Decided: {surname(d.winner === "dside" ? r.dn : r.rn)} ({partyOf(r, d.winner!)})</span>;
  const label = { waiting: s.feed.status === "closed" ? "Polls not closed" : "No results yet", counting: "Counting", close: "Too close to decide", runoff: "Runoff possible", rcv: "Ranked-choice count later", primary: "All-party primary", decided: "" }[d.state];
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

function tally(snaps: Snap[], office: "s" | "h", meta: WMeta) {
  const nuD = office === "s" ? meta.senate_not_up.D + meta.senate_not_up.I_caucus_D : 0, nuR = office === "s" ? meta.senate_not_up.R : 0;
  let decD = 0, decR = 0, leadD = 0, leadR = 0;
  for (const s of snaps) {
    if (s.row.o !== office) continue;
    if (s.decision.state === "decided") { const p = partyOf(s.row, s.decision.winner!); if (p === "D") decD++; else if (p === "R") decR++; }
    else if (s.margin != null) { if (s.margin >= 0 && s.row.dp === "D") leadD++; else if (s.margin < 0 && s.row.rp === "R") leadR++; }
  }
  const total = office === "s" ? 100 : 435;
  return { nuD, nuR, decD, decR, leadD, leadR, total, maj: office === "s" ? 51 : 218, openN: total - nuD - nuR - decD - decR - leadD - leadR };
}
type Tally = ReturnType<typeof tally>;

function SeatBar({ t, label }: { t: Tally; label: string }) {
  const w = (n: number) => `${(Math.max(n, 0) / t.total) * 100}%`;
  return (
    <div className="seatbar" role="img" aria-label={label}>
      <i style={{ width: w(t.nuD), background: "var(--d-lean)" }} /><i style={{ width: w(t.decD), background: "var(--d-safe)" }} /><i style={{ width: w(t.leadD), background: "var(--d-likely)", opacity: 0.55 }} />
      <i style={{ width: w(t.openN), background: "var(--uncalled)" }} />
      <i style={{ width: w(t.leadR), background: "var(--r-likely)", opacity: 0.55 }} /><i style={{ width: w(t.decR), background: "var(--r-safe)" }} /><i style={{ width: w(t.nuR), background: "var(--r-lean)" }} />
      <b style={{ left: w(t.maj) }} aria-hidden="true" />
    </div>
  );
}

function Scoreboard({ office, t, ch, base, tm }: { office: "s" | "h"; t: Tally; ch: Chamber | null; base: Chamber; tm: number }) {
  const D = ch ?? base;
  return (
    <div className="demo-panel">
      <div className="kicker">{office === "s" ? "U.S. Senate" : "U.S. House"} · {t.maj} for control</div>
      <div className="score-row">
        <div className="score-d"><span className="num">{t.decD + t.nuD}</span><small>Democratic</small></div>
        <div className="score-mid small muted">{t.leadD + t.leadR + Math.max(t.openN, 0)} undecided</div>
        <div className="score-r"><span className="num">{t.decR + t.nuR}</span><small>Republican</small></div>
      </div>
      <SeatBar t={t} label={`${office === "s" ? "Senate" : "House"}: ${t.decD + t.nuD} Democratic decided, ${t.decR + t.nuR} Republican decided, ${t.leadD} leading for Democrats, ${t.leadR} for Republicans`} />
      <div className="small demo-legend"><span><strong className="num">{t.leadD}</strong> D leading</span><span><strong className="num">{t.openN}</strong> not in yet</span><span><strong className="num">{t.leadR}</strong> R leading</span></div>
      <div className="small">Chance of control: <strong className="num" style={{ color: "var(--dem)" }}>{in100(D.D)} D</strong> · <strong className="num" style={{ color: "var(--rep)" }}>{in100(D.R)} R</strong><span className="muted"> (before polls closed: {in100(base.D)} / {in100(base.R)}){ch && tm > 0 && ch.ess < 30 ? " · few simulations match the count so far" : ""}</span></div>
      {office === "s" && <div className="small muted">A 50–50 Senate goes to the vice president, a Republican. “Decided” counts include seats not up this year ({t.nuD} D, {t.nuR} R).</div>}
    </div>
  );
}

function CandidateTable({ s }: { s: Snap }) {
  const v = candidateVotes(s), r = s.row, dec = s.decision.winner;
  const rowFor = (name: string | null, party: string | null, votes: number, pct: number, side: "dside" | "rside") => (
    <tr className={dec === side ? "win" : undefined}>
      <td><span className="check" aria-hidden="true">{dec === side ? "✓" : ""}</span><i className="pdot" style={{ background: party === "D" ? "var(--d-safe)" : party === "R" ? "var(--r-safe)" : "var(--ind-fill)" }} />{name ?? "—"} <span className="muted small">({party ?? "?"})</span>{dec === side && <span className="sr-only"> Decided</span>}</td>
      <td className="r num">{votes.toLocaleString("en-US")}</td><td className="r num">{pct.toFixed(1)}%</td>
    </tr>
  );
  return (
    <table className="data cand">
      <thead><tr><th>Candidate</th><th className="r">Votes</th><th className="r">Share</th></tr></thead>
      <tbody>{rowFor(r.dn, r.dp, v.d, v.dPct, "dside")}{rowFor(r.rn, r.rp, v.r, v.rPct, "rside")}
        <tr><td className="muted"><span className="check" />Other candidates</td><td className="r num muted">{v.o.toLocaleString("en-US")}</td><td className="r num muted">{v.oPct.toFixed(1)}%</td></tr></tbody>
    </table>
  );
}

function OddsChart({ pts, tm }: { pts: { t: number; p: number }[]; tm: number }) {
  if (pts.length < 2) return <p className="small muted">The chart appears once results start coming in.</p>;
  const W = 300, H = 90, x = (t: number) => 6 + (t / END) * (W - 12), y = (p: number) => H - 8 - p * (H - 16);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Live chance for the Democratic-side candidate over the night" style={{ display: "block" }}>
      <line x1={6} x2={W - 6} y1={y(0.5)} y2={y(0.5)} stroke="var(--line)" strokeDasharray="3 3" />
      <polyline fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" points={pts.map((q) => `${x(q.t).toFixed(1)},${y(q.p).toFixed(1)}`).join(" ")} />
      <line x1={x(tm)} x2={x(tm)} y1={4} y2={H - 4} stroke="var(--ink-muted)" strokeWidth={1} />
      <text x={8} y={12} fontSize={10} fill="var(--ink-muted)">100</text><text x={8} y={y(0.5) - 3} fontSize={10} fill="var(--ink-muted)">50</text><text x={8} y={H - 1} fontSize={10} fill="var(--ink-muted)">0</text>
    </svg>
  );
}

function Detail({ s, t, series, onPick, stateSnaps, preP }: { s: Snap; t: number; series: { t: number; p: number }[]; onPick: (id: string) => void; stateSnaps: Snap[]; preP: number }) {
  const r = s.row;
  const lead = s.margin == null ? null : Math.abs(candidateVotes(s).d - candidateVotes(s).r);
  return (
    <div className="demo-panel detail">
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span className="kicker">{r.o === "s" ? "Senate" : "House"} · polls close {clock(r.openAt)}</span>
        <span className="row" style={{ gap: 6 }}><FeedChip s={s} t={t} /><Status s={s} /></span>
      </div>
      <h3 style={{ margin: "6px 0 8px" }}>{r.title}</h3>
      {s.margin == null ? <p className="small muted">{s.decision.why}</p> : <CandidateTable s={s} />}
      {s.margin != null && (
        <>
          <div className="meter" role="img" aria-label={`About ${Math.round(Math.min(s.f, 1) * 100)}% of the expected vote counted`}><div style={{ width: `${Math.min(s.f, 1) * 100}%` }} /></div>
          <div className="small muted">≈{Math.round(Math.min(s.f, 0.99) * 100)}% of the expected vote counted (an estimate) · updated {t - (s.tEff ?? t) <= 0 ? "just now" : `${t - (s.tEff ?? t)} min ago`}{lead != null ? ` · lead ${lead.toLocaleString("en-US")} votes` : ""}</div>
          <div className="small" style={{ marginTop: 6 }}>{s.decision.why}</div>
        </>
      )}
      {s.feed.note && s.feed.status !== "ok" && <div className="small demo-note">{s.feed.note}</div>}
      {flipOfSnap(s) && <p style={{ margin: "8px 0 0" }}><span className="flip-chip">Flip · {r.holder} → {partyOf(r, s.decision.winner!)}</span></p>}
      <div className="small" style={{ margin: "10px 0 2px" }}><strong>Live odds</strong> for {surname(r.dn)}: <strong className="num">{in100(s.p)} in 100</strong> <span className="muted">(before polls closed: {in100(preP)})</span></div>
      <OddsChart pts={series} tm={t} />
      {stateSnaps.length > 1 && (
        <div style={{ marginTop: 10 }}>
          <div className="small muted">Other races in {r.st}</div>
          <div className="demo-chips">{stateSnaps.map((o) => (
            <button key={o.row.id} className={`demo-mini${o.row.id === r.id ? " on" : ""}`} onClick={() => onPick(o.row.id)} title={`${o.row.title}: ${o.decision.why}`}>
              <i style={{ background: fillFor(o) }} />{o.row.o === "s" ? "Sen" : `D${o.row.id.slice(-2)}`}
            </button>
          ))}</div>
        </div>
      )}
      <p className="small" style={{ margin: "10px 0 0" }}><Link href={`/race/${r.id}/`}>Forecast page for this race →</Link></p>
    </div>
  );
}

export default function ElectionNightDemo({ compact, schedule }: { compact: CompactRace[]; schedule: SchedRow[] }) {
  return <TipProvider><Inner compact={compact} schedule={schedule} /></TipProvider>;
}

type KeyTab = "s" | "h" | "flips";
function Inner({ compact, schedule }: { compact: CompactRace[]; schedule: SchedRow[] }) {
  const [meta, setMeta] = useState<WMeta | null>(null);
  const [sims, setSims] = useState<Int8Array | null>(null);
  const [err, setErr] = useState(false);
  const [kind, setKind] = useState<Scenario["kind"]>("typical");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [drills, setDrills] = useState<Drills>({ down: false, manual: false, bad: false, backward: false });
  const [mapTab, setMapTab] = useState<"s" | "h">("s");
  const [keyTab, setKeyTab] = useState<KeyTab>("s");
  const [selId, setSelId] = useState<string | null>(null);
  const [showCtl, setShowCtl] = useState(false);
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
  const base = useMemo(() => (meta && sims ? { s: liveChamber(meta, sims, "s", {}, []), h: liveChamber(meta, sims, "h", {}, []) } : null), [meta, sims]);
  const chambers = useMemo(() => {
    if (!meta || !sims || !snaps) return null;
    const out = {} as Record<"s" | "h", Chamber>;
    for (const o of ["s", "h"] as const) {
      const decided: Record<string, "dside" | "rside"> = {}, soft: { id: string; margin: number; sd: number }[] = [];
      for (const s of snaps) {
        if (s.row.o !== o) continue;
        if (s.decision.winner) decided[s.row.id] = s.decision.winner;
        else if (s.margin != null && s.f >= 0.1) soft.push({ id: s.row.id, margin: s.margin, sd: Math.hypot(8 * (1 - Math.min(s.f, 1)), 0.5) + 2 });
      }
      out[o] = liveChamber(meta, sims, o, decided, soft);
    }
    return out;
  }, [meta, sims, snaps]);
  const sel = useMemo(() => (snaps && selId ? snaps.find((s) => s.row.id === selId) ?? null : null), [snaps, selId]);
  const series = useMemo(() => {
    if (!sel || !sc) return [];
    const pts: { t: number; p: number }[] = [];
    for (let x = Math.max(0, Math.floor(sel.row.start)); x <= tm; x += 3) { const s = snapshot(sel.row, sc.finals[sel.row.id], x, drills); if (s.margin != null) pts.push({ t: x, p: s.p }); }
    return pts;
  }, [sel, sc, tm, drills]);

  if (err) return <p role="alert" className="wrap" style={{ padding: "32px 0" }}>The simulation file didn’t load. Refresh to try again.</p>;
  if (!meta || !rows || !sc || !snaps || !base || !chambers) return <p className="muted wrap" style={{ padding: "32px 0" }}>Loading the rehearsal…</p>;

  const ts = tally(snaps, "s", meta), th = tally(snaps, "h", meta);
  const pickState = (st: string) => { const first = snaps.find((s) => s.row.o === "s" && s.row.st === st) ?? snaps.find((s) => s.row.st === st); if (first) setSelId(first.row.id); };
  const selDetail = sel ?? snaps.find((s) => s.row.o === "s" && s.margin != null) ?? null;
  const preP = (id: string) => { const r = rows.find((x) => x.id === id)!; return snapshot(r, sc.finals[id], 0, drills).p; };
  const nextClose = (() => {
    const up = [...new Set(rows.filter((r) => r.openAt > tm).map((r) => r.openAt))].sort((a, b) => a - b)[0];
    if (up == null) return null;
    return { at: up, states: [...new Set(rows.filter((r) => r.openAt === up).map((r) => r.st))].sort(), inMin: up - tm };
  })();
  const keyRows = snaps.filter((s) => s.feed.tEff != null && s.f >= 0.02 && (keyTab === "flips" ? flipOfSnap(s) : s.row.o === keyTab))
    .sort((a, b) => (keyTab === "flips" ? 0 : Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5)));
  const flips = snaps.filter(flipOfSnap);
  const flipTo = (p: string) => flips.filter((s) => partyOf(s.row, s.decision.winner!) === p).length;
  const byState = new Map<string, Snap[]>();
  for (const s of snaps) (byState.get(s.row.st) ?? byState.set(s.row.st, []).get(s.row.st)!).push(s);
  const states = [...byState.entries()].map(([st, ss]) => ({ st, openAt: ss[0].row.openAt, decided: ss.every((s) => s.decision.state === "decided"), any: ss.some((s) => s.feed.tEff != null), bad: ss.find((s) => ["stale", "error", "review", "manual"].includes(s.feed.status)), n: ss.length, nDec: ss.filter((s) => s.decision.state === "decided").length }))
    .sort((a, b) => a.openAt - b.openAt || a.st.localeCompare(b.st));
  const hours = new Map<number, typeof states>();
  for (const s of states) { const h = Math.floor(s.openAt / 60); (hours.get(h) ?? hours.set(h, []).get(h)!).push(s); }
  const unhealthy = states.filter((s) => s.bad);
  const toggle = (k: keyof Drills) => setDrills((d) => ({ ...d, [k]: !d[k], ...(k === "down" && d.down ? { manual: false } : {}) }));
  const mini = (tl: Tally, name: string, c: Chamber | null, b: Chamber) => (
    <div className="mini-score" title={`${name}: chance of control ${in100((c ?? b).D)} D / ${in100((c ?? b).R)} R`}>
      <span className="small muted">{name}</span> <strong className="num" style={{ color: "var(--dem)" }}>{tl.decD + tl.nuD}</strong><span className="muted">–</span><strong className="num" style={{ color: "var(--rep)" }}>{tl.decR + tl.nuR}</strong>
    </div>
  );

  return (
    <div>
      <div className="demo-controls">
        <div className="wrap row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <strong className="num demo-clock">{clock(tm)} ET<small>{dayLabel(tm)}</small></strong>
          <button className="btn" onClick={() => { if (t >= END) setT(0); setPlaying((p) => !p); }} aria-pressed={playing}>{playing ? "Pause" : t >= END ? "Replay" : t > 0 ? "Resume" : "Start the night"}</button>
          <label className="sr-only" htmlFor="scrub">Time of night</label>
          <input id="scrub" type="range" min={0} max={END} step={1} value={tm} onChange={(e) => { setPlaying(false); setT(+e.target.value); }} style={{ flex: "1 1 160px", minWidth: 120 }} />
          <div className="toggle" role="group" aria-label="Speed">{SPEEDS.map(([l, v]) => <button key={l} aria-pressed={speed === v} onClick={() => setSpeed(v)}>{l}</button>)}</div>
          <div className="mini-scores">{mini(ts, "Senate", chambers.s, base.s)}{mini(th, "House", chambers.h, base.h)}</div>
        </div>
      </div>

      <div className="wrap">
        <div className="demo-next small" role="status">
          {nextClose ? <>Next polls close at <strong>{clock(nextClose.at)} ET</strong>{nextClose.inMin > 0 ? ` (in ${nextClose.inMin} min)` : ""}: {nextClose.states.join(", ")}</> : <>All polls are closed. Counting continues in the slower states.</>}
        </div>

        <section className="block" style={{ paddingTop: 12 }} aria-labelledby="board-h">
          <h2 id="board-h" className="sr-only">Balance of power</h2>
          <div className="demo-grid">
            <Scoreboard office="s" t={ts} ch={tm > 0 ? chambers.s : null} base={base.s} tm={tm} />
            <Scoreboard office="h" t={th} ch={tm > 0 ? chambers.h : null} base={base.h} tm={tm} />
          </div>
        </section>

        <section className="block" aria-labelledby="map-h" style={{ paddingTop: 8 }}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <h2 id="map-h" className="display">Live map</h2>
            <div className="toggle" role="group" aria-label="Which map">
              <button aria-pressed={mapTab === "s"} onClick={() => setMapTab("s")}>Senate</button>
              <button aria-pressed={mapTab === "h"} onClick={() => setMapTab("h")}>House districts</button>
            </div>
          </div>
          <div className="nm-layout">
            <div>
              {mapTab === "s" ? <DemoStateMap snaps={snaps} selState={sel?.row.st ?? null} onState={pickState} /> : <DemoHexMap snaps={snaps} selId={selId} onPick={(id) => setSelId(id)} />}
              <MapLegend />
              <p className="small muted" style={{ marginTop: 6 }}>Click a {mapTab === "s" ? "state" : "district"} for its numbers. Colors follow the count: nothing is “called” by anyone else, and light colors mean leading, not decided.</p>
            </div>
            <div>
              {selDetail ? <Detail s={selDetail} t={tm} series={series.length && sel ? series : []} onPick={setSelId} stateSnaps={byState.get(selDetail.row.st) && byState.get(selDetail.row.st)!.length < 12 ? byState.get(selDetail.row.st)! : []} preP={preP(selDetail.row.id)} />
                : <div className="demo-panel"><p className="muted" style={{ margin: 0 }}>{tm === 0 ? "Press “Start the night”. Polls begin closing at 6 PM ET. Then click a state or district." : "Click a state or district on the map."}</p></div>}
            </div>
          </div>
        </section>

        <section className="block" aria-labelledby="key-h">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <h2 id="key-h" className="display">Races</h2>
            <div className="toggle" role="group" aria-label="Which races">
              {([["s", "Senate"], ["h", "House"], ["flips", `Flips (${flips.length})`]] as const).map(([k, l]) => <button key={k} aria-pressed={keyTab === k} onClick={() => setKeyTab(k)}>{l}</button>)}
            </div>
          </div>
          <p className="takeaway small">{keyTab === "flips" ? <><span className="flip-chip">{flips.length} decided flips</span> <span className="muted">to D {flipTo("D")} · to R {flipTo("R")}</span></> : "Races with results in, closest first (by live odds)."}</p>
          {keyRows.length === 0 ? <p className="muted">{keyTab === "flips" ? "No decided flips yet." : "Nothing reporting yet."}</p> : (
            <div className="table-wrap">
              <table className="data cards">
                <thead><tr><th>Race</th><th>Democratic side</th><th>Republican side</th><th className="r">In</th><th>Status</th></tr></thead>
                <tbody>{keyRows.slice(0, keyTab === "h" ? 40 : 60).map((s) => {
                  const v = candidateVotes(s), win = s.decision.winner;
                  return (
                    <tr key={s.row.id} className={flipOfSnap(s) ? "flip" : undefined} onClick={() => { setSelId(s.row.id); setMapTab(s.row.o); }} style={{ cursor: "pointer" }}>
                      <td data-label="Race"><strong>{s.row.title}</strong>{flipOfSnap(s) && <> <span className="flip-chip">flip</span></>}</td>
                      <td data-label="Democratic side">{win === "dside" ? "✓ " : ""}{surname(s.row.dn)} <strong className="num">{v.dPct.toFixed(1)}%</strong></td>
                      <td data-label="Republican side">{win === "rside" ? "✓ " : ""}{surname(s.row.rn)} <strong className="num">{v.rPct.toFixed(1)}%</strong></td>
                      <td data-label="In" className="r num">{Math.round(Math.min(s.f, 0.99) * 100)}%</td>
                      <td data-label="Status"><span className="row" style={{ gap: 6 }}><FeedChip s={s} t={tm} /><Status s={s} /></span></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="block" aria-labelledby="time-h">
          <h2 id="time-h" className="display">Polls closing</h2>
          <div className="demo-timeline">
            {[...hours.entries()].sort((a, b) => a[0] - b[0]).map(([h, ss]) => (
              <div key={h} className="demo-hour">
                <div className="small muted">{clock(h * 60)}</div>
                <div className="demo-states">{ss.map((s) => (
                  <button key={s.st} className={`demo-state ${s.decided ? "done" : s.any ? "live" : tm >= s.openAt ? "wait" : ""}${s.bad ? " bad" : ""}`} onClick={() => pickState(s.st)} title={`${s.st}: ${s.nDec} of ${s.n} races decided`}>{s.st}</button>
                ))}</div>
              </div>
            ))}
          </div>
          <p className="small muted">Gray: polls not closed · outlined: closed, no results · blue-gray: results coming in · solid: every race in the state decided · amber ring: a feed problem.</p>
        </section>

        <section className="block" aria-labelledby="feed-h">
          <h2 id="feed-h" className="display">State feed health</h2>
          <p className="takeaway small"><strong className="num">{states.filter((s) => s.any).length - unhealthy.length}</strong> of {states.filter((s) => s.any).length} reporting states are updating normally{unhealthy.length ? `; ${unhealthy.length} need${unhealthy.length === 1 ? "s" : ""} attention` : ""}.</p>
          {unhealthy.length === 0 ? <p className="small muted">Nothing needs attention. Open “Rehearsal controls” and turn on a failure drill.</p> : <ul className="plain">{unhealthy.map((s) => <li key={s.st}><strong>{s.st}</strong>: {s.bad!.feed.note}</li>)}</ul>}
        </section>

        <section className="block" aria-labelledby="ctl-h">
          <button className="btn" onClick={() => setShowCtl((v) => !v)} aria-expanded={showCtl} id="ctl-h">Rehearsal controls {showCtl ? "▲" : "▼"}</button>
          {showCtl && (
            <div style={{ marginTop: 12 }}>
              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <label className="small" htmlFor="scen"><strong>Pretend outcome</strong></label>
                <select id="scen" className="demo-select" value={kind} onChange={(e) => setKind(e.target.value as Scenario["kind"])}>
                  {(Object.keys(SCENARIOS) as Scenario["kind"][]).map((k) => <option key={k} value={k}>{SCENARIOS[k]}</option>)}
                </select>
              </div>
              <fieldset className="demo-drills">
                <legend className="small"><strong>Break something</strong> (failure drills)</legend>
                <label><input type="checkbox" checked={drills.down} onChange={() => toggle("down")} /> Pennsylvania’s feed goes down at 9:30 PM</label>
                <label><input type="checkbox" checked={drills.manual} disabled={!drills.down} onChange={() => toggle("manual")} /> …and I enter Pennsylvania by hand from 11:30 PM</label>
                <label><input type="checkbox" checked={drills.bad} onChange={() => toggle("bad")} /> Nevada sends unreadable data, 11:30 PM–12:30 AM</label>
                <label><input type="checkbox" checked={drills.backward} onChange={() => toggle("backward")} /> Georgia’s count goes backward at 11:00 PM</label>
              </fieldset>
            </div>
          )}
          <ul className="plain" style={{ marginTop: 16 }}>
            <li><strong>Decided</strong> appears only when the vote still uncounted, with generous safety margins, cannot overturn the lead. Under a third of the expected vote, or a lead under one point, is never Decided. It is our own rule, never attributed to anyone else, and it is not a “projected winner.”</li>
            <li><strong>Live odds</strong> start from the pre-election forecast and move toward the count as more is in. <strong>% in</strong> is an estimate from expected turnout.</li>
            <li>Governors’ races are not in this rehearsal. <strong>Georgia</strong> goes to a runoff if nobody tops 50%; <strong>Maine</strong> and <strong>Alaska</strong> show first-round counts, ranked-choice count later; <strong>Louisiana’s</strong> House races on Nov. 3 are an all-party primary.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
