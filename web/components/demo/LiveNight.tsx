"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildGovRows, buildRows, candidateVotes, clock, partyOf, type CompactRace, type GovRace, type SchedRow, type Snap } from "@/lib/demo";
import { in100, surname } from "@/lib/format";
import { liveChamber, liveOdds } from "@/lib/live";
import { liveSnaps, minutesSinceStart } from "@/lib/livesnap";
import type { WMeta } from "@/lib/whatif";
import { TipProvider } from "@/components/Tooltip";
import { useLive } from "@/components/useLive";
import { DemoHexMap, DemoStateMap, flipOfSnap, MapLegend } from "./DemoMaps";
import { Detail, FeedChip, GovBoard, Scoreboard, Status, tally, tallyGov, type Chamber, type Tally } from "./ElectionNightDemo";
import StateDrill, { type DrillTab } from "./StateDrill";

type KeyTab = "s" | "g" | "h" | "proj" | "flips";
const dayLabel = (t: number) => (t >= 360 ? " · Nov. 4" : "");

/** The real election-night board: the rehearsal's scoreboard, maps and tables, fed by the worker's live file instead of a simulation. */
export default function LiveNight({ compact, schedule, govs, stateNames }: { compact: CompactRace[]; schedule: SchedRow[]; govs: GovRace[]; stateNames: Record<string, string> }) {
  return <TipProvider><Inner compact={compact} schedule={schedule} govs={govs} stateNames={stateNames} /></TipProvider>;
}

function Inner({ compact, schedule, govs, stateNames }: { compact: CompactRace[]; schedule: SchedRow[]; govs: GovRace[]; stateNames: Record<string, string> }) {
  const { results, status, error, fetchedAt } = useLive();
  const [meta, setMeta] = useState<WMeta | null>(null);
  const [sims, setSims] = useState<Int8Array | null>(null);
  const [err, setErr] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [mapTab, setMapTab] = useState<"s" | "g" | "h">("s");
  const [drill, setDrill] = useState<{ st: string; tab: DrillTab } | null>(null);
  const [keyTab, setKeyTab] = useState<KeyTab>("s");
  const [selId, setSelId] = useState<string | null>(null);
  const hist = useRef(new Map<string, { t: number; p: number }[]>());

  useEffect(() => {
    Promise.all([fetch("/data/whatif.json").then((r) => r.json()), fetch("/data/whatif.bin").then((r) => r.arrayBuffer())])
      .then(([m, b]) => { setMeta(m); setSims(new Int8Array(b)); }).catch(() => setErr(true));
  }, []);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);

  const rows = useMemo(() => (meta && sims ? [...buildRows(meta, sims, compact, schedule), ...buildGovRows(govs, schedule)] : null), [meta, sims, compact, schedule, govs]);
  const snaps = useMemo(() => (rows && now != null ? liveSnaps(rows, results, status, now) : null), [rows, results, status, now]);
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

  // odds-over-time for the race you are looking at: points collected while this page is open
  const stamp = results?.updated ?? null;
  useEffect(() => {
    if (!snaps || !stamp) return;
    const t = minutesSinceStart(Date.parse(stamp));
    for (const s of snaps) {
      if (s.margin == null) continue;
      const a = hist.current.get(s.row.id) ?? [];
      if (!a.length || a[a.length - 1].t < t) { a.push({ t, p: s.p }); hist.current.set(s.row.id, a); }
    }
  }, [snaps, stamp]);

  if (err) return <p role="alert" className="wrap" style={{ padding: "32px 0" }}>The simulation file didn’t load. Refresh to try again.</p>;
  if (!meta || !rows || !snaps || !base || !chambers || now == null) return <p className="muted wrap" style={{ padding: "32px 0" }}>Loading the election-night board…</p>;

  const tm = Math.floor(minutesSinceStart(now));
  const ts = tally(snaps, "s", meta), th = tally(snaps, "h", meta), tg = tallyGov(snaps);
  const anyVotes = snaps.some((s) => s.margin != null);
  const sel = selId ? snaps.find((s) => s.row.id === selId) ?? null : null;
  /** Open a state: its Senate or governor race by county, or its House districts, with the numbers beside it. */
  const openState = (st: string, want?: DrillTab, id?: string) => {
    const order: DrillTab[] = want ? [want, "s", "g", "h"] : ["s", "g", "h"];
    const tab = order.find((t) => snaps.some((s) => s.row.st === st && s.row.o === t)) ?? "s";
    const first = (id && snaps.find((s) => s.row.id === id)) || snaps.find((s) => s.row.st === st && s.row.o === tab);
    setDrill({ st, tab });
    if (first) setSelId(first.row.id);
    setTimeout(() => document.getElementById("map-h")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }), 30);
  };
  const pickState = (st: string) => openState(st, mapTab === "g" ? "g" : "s");
  const selDetail = sel ?? snaps.filter((s) => s.row.o === (mapTab === "g" ? "g" : "s") && s.margin != null).sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5))[0] ?? null;
  const preP = (r: { mu0: number; sd0: number }) => liveOdds(r.mu0, r.sd0, null).p;   // chance before any votes were counted
  const nextClose = (() => {
    const up = [...new Set(rows.filter((r) => r.openAt > tm).map((r) => r.openAt))].sort((a, b) => a - b)[0];
    return up == null ? null : { at: up, states: [...new Set(rows.filter((r) => r.openAt === up).map((r) => r.st))].sort(), inMin: Math.round(up - minutesSinceStart(now)) };
  })();
  const keyRows = snaps.filter((s) => s.feed.tEff != null && s.margin != null && (keyTab === "flips" ? flipOfSnap(s) : keyTab === "proj" ? s.decision.state === "decided" : s.row.o === keyTab))
    .sort((a, b) => (keyTab === "flips" ? 0 : keyTab === "proj" ? a.row.o.localeCompare(b.row.o) || a.row.title.localeCompare(b.row.title) : Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5)));
  const nProj = snaps.filter((s) => s.decision.state === "decided").length;
  const flips = snaps.filter(flipOfSnap);
  const flipTo = (p: string) => flips.filter((s) => partyOf(s.row, s.decision.winner!) === p).length;
  const byState = new Map<string, Snap[]>();
  for (const s of snaps) (byState.get(s.row.st) ?? byState.set(s.row.st, []).get(s.row.st)!).push(s);
  const states = [...byState.entries()].map(([st, ss]) => ({ st, openAt: ss[0].row.openAt, decided: ss.every((s) => s.decision.state === "decided"), any: ss.some((s) => s.margin != null), bad: ss.find((s) => ["stale", "error", "review", "manual"].includes(s.feed.status)), n: ss.length, nDec: ss.filter((s) => s.decision.state === "decided").length }))
    .sort((a, b) => a.openAt - b.openAt || a.st.localeCompare(b.st));
  const hours = new Map<number, typeof states>();
  for (const s of states) { const h = Math.floor(s.openAt / 60); (hours.get(h) ?? hours.set(h, []).get(h)!).push(s); }
  const reading = status ? Object.entries(status.states).filter(([, v]) => v.state === "ok" || v.state === "partial").map(([k]) => k).sort() : [];
  const attention = status ? Object.entries(status.states).filter(([, v]) => v.state === "stale" || v.state === "down" || v.state === "paused") : [];
  const unhealthy = states.filter((s) => s.bad);
  const updatedAgo = status?.updated ? Math.max(0, Math.round((now - Date.parse(status.updated)) / 60000)) : null;
  const mini = (tl: Tally, name: string) => (
    <div className="mini-score"><span className="small muted">{name}</span> <strong className="num" style={{ color: "var(--dem)" }}>{tl.decD + tl.nuD}</strong><span className="muted">–</span><strong className="num" style={{ color: "var(--rep)" }}>{tl.decR + tl.nuR}</strong></div>
  );
  const series = sel ? hist.current.get(sel.row.id) ?? [] : selDetail ? hist.current.get(selDetail.row.id) ?? [] : [];

  return (
    <div>
      <div className="demo-controls">
        <div className="wrap row" style={{ gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <strong className="num demo-clock">{clock(tm)} ET<small>{dayLabel(tm)}</small></strong>
          <span className="small muted" role="status">{anyVotes ? (updatedAgo == null ? "Live" : `Updated ${updatedAgo < 1 ? "just now" : `${updatedAgo} min ago`}`) : "Results appear as polls close"}{anyVotes && (status?.publish_every_s ?? 0) >= 300 ? ` · refreshes about every ${Math.round((status!.publish_every_s ?? 720) / 60)} minutes` : ""}{error ? " · connection problem, showing the last numbers" : ""}</span>
          <div className="mini-scores" style={{ marginLeft: "auto" }}>{mini(ts, "Senate")}{mini(th, "House")}<div className="mini-score"><span className="small muted">Gov.</span> <strong className="num" style={{ color: "var(--dem)" }}>{tg.decD}</strong><span className="muted">–</span><strong className="num" style={{ color: "var(--rep)" }}>{tg.decR}</strong></div></div>
        </div>
      </div>

      <div className="wrap">
        <div className="demo-next small" role="status">
          {nextClose ? <>Next polls close at <strong>{clock(nextClose.at)} ET</strong>{nextClose.inMin > 0 ? ` (in ${nextClose.inMin < 90 ? `${nextClose.inMin} min` : `${Math.round(nextClose.inMin / 60)} hours`})` : ""}: {nextClose.states.join(", ")}</> : <>All polls are closed. Counting continues in the slower states.</>}
        </div>

        {!anyVotes && <p className="takeaway" style={{ margin: "14px 0 0" }}>Nothing has been counted yet. This board fills in on its own as each state reports. Until then the chances of control below are the forecast’s, from before the polls closed.</p>}

        <section className="block" style={{ paddingTop: 12 }} aria-labelledby="board-h">
          <h2 id="board-h" className="sr-only">Balance of power</h2>
          <div className="demo-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <Scoreboard office="s" t={ts} ch={anyVotes ? chambers.s : null} base={base.s} tm={anyVotes ? 1 : 0} />
            <Scoreboard office="h" t={th} ch={anyVotes ? chambers.h : null} base={base.h} tm={anyVotes ? 1 : 0} />
            <GovBoard g={tg} />
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {reading.length ? <>Numbers come straight from {reading.length} state result sites that we read automatically ({reading.join(", ")}); other states appear when their results are entered from official sources. </> : <>States appear here as their official results are read or entered. </>}
            Seats not up this year are counted as held by their party. “Projected” is Bellwether’s own projection (see how below), not a call by AP or anyone else.
          </p>
        </section>

        <section className="block" aria-labelledby="map-h" style={{ paddingTop: 8 }}>
          {drill ? (
            <StateDrill st={drill.st} stateName={stateNames[drill.st] ?? drill.st} tab={drill.tab} setTab={(t) => setDrill({ st: drill.st, tab: t })} snaps={snaps} selId={selId} setSelId={setSelId}
              hist={hist.current} tm={tm} preP={preP} onBack={() => setDrill(null)} />
          ) : (
            <>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <h2 id="map-h" className="display">Map</h2>
                <div className="toggle" role="group" aria-label="Which map">
                  <button aria-pressed={mapTab === "s"} onClick={() => setMapTab("s")}>Senate</button>
                  <button aria-pressed={mapTab === "g"} onClick={() => setMapTab("g")}>Governor</button>
                  <button aria-pressed={mapTab === "h"} onClick={() => setMapTab("h")}>House districts</button>
                </div>
              </div>
              <div className="nm-layout">
                <div>
                  {mapTab === "h" ? <DemoHexMap snaps={snaps} selId={selId} onPick={(id) => { const r = snaps.find((x) => x.row.id === id); if (r) openState(r.row.st, "h", id); }} /> : <DemoStateMap snaps={snaps} selState={sel?.row.st ?? null} onState={pickState} office={mapTab} />}
                  <MapLegend />
                  <p className="small muted" style={{ marginTop: 6 }}><strong>Click a {mapTab === "h" ? "district" : "state"}</strong> to zoom in: {mapTab === "h" ? "its district outlines and numbers" : "its counties, with the numbers beside them, and a switch to its House districts"}. Light colors mean leading, not yet projected; solid means Bellwether projects a winner.</p>
                </div>
                <div>
                  {selDetail ? <Detail s={selDetail} t={tm} series={series.length > 1 ? series : []} onPick={setSelId} stateSnaps={byState.get(selDetail.row.st) && byState.get(selDetail.row.st)!.length < 12 ? byState.get(selDetail.row.st)! : []} preP={preP(selDetail.row)} />
                    : <div className="demo-panel"><p className="muted" style={{ margin: 0 }}>Click a state or district on the map. Numbers appear here once a race starts reporting.</p></div>}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="block" aria-labelledby="key-h">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <h2 id="key-h" className="display">Races</h2>
            <div className="toggle" role="group" aria-label="Which races">
              {([["s", "Senate"], ["g", "Governor"], ["h", "House"], ["proj", `Projected (${nProj})`], ["flips", `Flips (${flips.length})`]] as const).map(([k, l]) => <button key={k} aria-pressed={keyTab === k} onClick={() => setKeyTab(k)}>{l}</button>)}
            </div>
          </div>
          <p className="takeaway small">{keyTab === "proj" ? <>Races where Bellwether projects a winner. These are our own projections, not calls by AP or anyone else.</> : keyTab === "flips" ? <><span className="flip-chip">{flips.length} projected flips</span> <span className="muted">to D {flipTo("D")} · to R {flipTo("R")}</span></> : "Races with results in, closest first (by live odds)."}</p>
          {keyRows.length === 0 ? <p className="muted">{keyTab === "flips" ? "No projected flips yet." : keyTab === "proj" ? "Nothing projected yet." : "Nothing reporting yet."}</p> : (
            <div className="table-wrap">
              <table className="data cards">
                <thead><tr><th>Race</th><th>Democratic side</th><th>Republican side</th><th className="r">In</th><th>Status</th></tr></thead>
                <tbody>{keyRows.slice(0, keyTab === "h" ? 60 : 70).map((s) => {
                  const v = candidateVotes(s), win = s.decision.winner;
                  return (
                    <tr key={s.row.id} className={flipOfSnap(s) ? "flip" : undefined} onClick={() => openState(s.row.st, s.row.o, s.row.id)} style={{ cursor: "pointer" }}>
                      <td data-label="Race"><Link href={`/race/${s.row.id}/`}><strong>{s.row.title}</strong></Link>{flipOfSnap(s) && <> <span className="flip-chip">flip</span></>}</td>
                      <td data-label="Democratic side">{win === "dside" ? "✓ " : ""}{surname(s.row.dn)} <strong className="num">{v.dPct.toFixed(1)}%</strong></td>
                      <td data-label="Republican side">{win === "rside" ? "✓ " : ""}{surname(s.row.rn)} <strong className="num">{v.rPct.toFixed(1)}%</strong></td>
                      <td data-label="In" className="r num">{s.units > 0 ? `${Math.round(Math.min(s.units, 0.99) * 100)}%` : "—"}</td>
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
                  <button key={s.st} className={`demo-state ${s.decided ? "done" : s.any ? "live" : tm >= s.openAt ? "wait" : ""}${s.bad ? " bad" : ""}`} onClick={() => openState(s.st)} title={`${s.st}: ${s.nDec} of ${s.n} races projected`}>{s.st}</button>
                ))}</div>
              </div>
            ))}
          </div>
          <p className="small muted">Gray: polls not closed · outlined: closed, no results · blue-gray: results coming in · solid: every race in the state projected · amber ring: a feed problem. Full <Link href="/schedule/">schedule of what to watch</Link>.</p>
        </section>

        <section className="block" aria-labelledby="feed-h">
          <h2 id="feed-h" className="display">Where the numbers come from</h2>
          {attention.length === 0 && unhealthy.length === 0
            ? <p className="small muted">{reading.length ? `All ${reading.length} automatic feeds are updating normally.` : "No automatic feeds have reported yet."} Each race lists its source.</p>
            : <ul className="plain">
                {attention.map(([st, v]) => <li key={st}><strong>{st}</strong>: {v.state === "paused" ? "paused by hand" : v.last_success ? `no new numbers since ${new Date(v.last_success).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "waiting for the state to publish results"}</li>)}
                {unhealthy.map((s) => <li key={`u${s.st}`}><strong>{s.st}</strong>: {s.bad!.feed.note}</li>)}
              </ul>}
          <ul className="plain" style={{ marginTop: 14 }}>
            <li><strong>Projected</strong> means Bellwether projects the winner: by our own calculation, the votes still uncounted cannot realistically overturn the lead. We require a clear lead (over one point), enough of the vote counted, and a safety margin for late ballots; mail-heavy states need more counted first. These are our projections, made by our own rule. They are not calls by AP or any other organization, and an official result can differ. A race that is not projected is still being counted.</li>
            <li><strong>Live odds</strong> start from the pre-election forecast and move toward the count as more is in. <strong>In</strong> is the share of precincts or counties reporting.</li>
            <li><strong>Georgia</strong> goes to a runoff if nobody tops 50%; <strong>Maine</strong> and <strong>Alaska</strong> show first-round counts, ranked-choice count later; <strong>Louisiana’s</strong> House races on Nov. 3 are an all-party primary.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
