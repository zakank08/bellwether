"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUCKET_LABEL, bucketVar, in100, onBucket } from "@/lib/format";
import { TILES } from "@/lib/tiles";
import type { Bucket } from "@/lib/types";
import { compute, decode, encode, pathTo, type Pick, type Picks, type WMeta, type WRace } from "@/lib/whatif";
import CountUp from "./CountUp";
import InfoTip from "./InfoTip";

const bucketOf = (p: number, dp: string | null, rp: string | null): Bucket => {
  const lead = p >= 0.5 ? dp : rp, q = p >= 0.5 ? p : 1 - p;
  const side = lead === "D" ? "d" : lead === "R" ? "r" : "i";
  if (q >= 0.95) return `${side}-safe` as Bucket;
  if (q >= 0.75) return `${side}-likely` as Bucket;
  if (q >= 0.6) return `${side}-lean` as Bucket;
  return "tossup";
};
const partyFill = (party: string | null) => (party === "D" ? "var(--d-safe)" : party === "R" ? "var(--r-safe)" : "var(--ind-fill)");
const last = (s: string | null) => (s ?? "").split(" ").slice(-1)[0];

export default function WhatIf() {
  const [meta, setMeta] = useState<WMeta | null>(null);
  const [sims, setSims] = useState<Int8Array | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const [shift, setShift] = useState(0);
  const [tab, setTab] = useState<"s" | "h">("s");
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    let dead = false;
    Promise.all([fetch("/data/whatif.json").then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("/data/whatif.bin").then((r) => { if (!r.ok) throw new Error(); return r.arrayBuffer(); })])
      .then(([m, b]: [WMeta, ArrayBuffer]) => {
        if (dead) return;
        setMeta(m); setSims(new Int8Array(b));
        const d = decode(m, window.location.hash);
        setPicks(d.picks); setShift(d.shift);
        if (Object.keys(d.picks).some((id) => id.includes("house")) && !Object.keys(d.picks).some((id) => id.includes("sen"))) setTab("h");
      })
      .catch(() => !dead && setErr("The simulation file didn’t load. Check your connection and refresh the page."));
    return () => { dead = true; };
  }, []);

  const res = useMemo(() => (meta && sims ? compute(meta, sims, picks, shift) : null), [meta, sims, picks, shift]);
  const base = useMemo(() => (meta && sims ? compute(meta, sims, {}, 0) : null), [meta, sims]);

  useEffect(() => {
    if (!meta) return;
    const h = encode(meta, picks, shift);
    history.replaceState(null, "", h ? `#${h}` : window.location.pathname);
  }, [meta, picks, shift]);

  const cycle = useCallback((id: string) => {
    setPicks((p) => {
      const n = { ...p };
      if (!p[id]) n[id] = "dside"; else if (p[id] === "dside") n[id] = "rside"; else delete n[id];
      return n;
    });
  }, []);
  const set = (id: string, v: Pick | null) => setPicks((p) => { const n = { ...p }; if (v) n[id] = v; else delete n[id]; return n; });

  if (err) return <div className="wrap"><p role="alert" style={{ padding: "48px 0" }}>{err}</p></div>;
  if (!meta || !res || !base) return <Loading />;

  const ch = res.chamber[tab];
  const bch = base.chamber[tab];
  const maj = tab === "s" ? meta.senate_majority : meta.house_majority;
  const officeRaces = meta.races.filter((r) => r.o === tab);
  const nPicked = officeRaces.filter((r) => picks[r.id]).length;
  const delta = Math.round(ch.D * 100) - Math.round(bch.D * 100);
  const chamberName = tab === "s" ? "Senate" : "House";

  return (
    <div className="wrap">
      <section className="block" style={{ paddingTop: 32 }}>
        <div className="kicker">Build your own forecast</div>
        <h1 className="display" style={{ margin: "4px 0 8px" }}>What if…?</h1>
        <p className="takeaway">
          Pick winners and the rest of the map updates. It uses the model’s own simulations: give a state to one party and we keep only the simulations where that happened, so similar states shift too. <InfoTip term="conditional" />
        </p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="toggle" role="group" aria-label="Chamber">
            <button aria-pressed={tab === "s"} onClick={() => setTab("s")}>Senate</button>
            <button aria-pressed={tab === "h"} onClick={() => setTab("h")}>House</button>
          </div>
          <div className="row">
            <button className="btn" onClick={() => { setPicks({}); setShift(0); }} disabled={!Object.keys(picks).length && !shift}>Reset</button>
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(window.location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }}>
              {copied ? "Link copied ✓" : "Copy link"}
            </button>
            <button className="btn" onClick={() => saveImage(meta, res, tab, shift)}>Save image</button>
          </div>
        </div>
      </section>

      {/* Scoreboard */}
      <div className="scoreboard" role="status" aria-live="polite">
        <div>
          <div className="kicker">{chamberName} control in your scenario</div>
          <div className="row" style={{ gap: 24, alignItems: "baseline", marginTop: 4 }}>
            <span className="display big-odds" style={{ color: "var(--dem)" }}><CountUp value={ch.D * 100} /><small> D</small></span>
            <span className="display big-odds" style={{ color: "var(--rep)" }}><CountUp value={ch.R * 100} /><small> R</small></span>
            {ch.C >= 0.005 && <span className="small muted"><span className="num">{in100(ch.C)}</span> no majority</span>}
          </div>
          <div className="small muted" style={{ marginTop: 2 }}>
            Chances out of 100, from 4,000 of the forecast’s simulations (so they can differ from the main page by a point or two).{" "}
            {delta !== 0 ? <span style={{ color: delta > 0 ? "var(--dem)" : "var(--rep)" }}>Democrats {delta > 0 ? "+" : "−"}{Math.abs(delta)} vs. the forecast</span> : "Same as the forecast"}
            {res.mode === "forced" && <> · <span style={{ color: "var(--signal)" }}>Rare combination: other races aren’t adjusted for your picks.</span></>}
          </div>
        </div>
        <SeatMeter d={ch.medianD} total={tab === "s" ? 100 : 435} maj={maj} label={chamberName} />
      </div>

      <section className="block" style={{ paddingTop: 16 }}>
        <label htmlFor="shift" className="row" style={{ justifyContent: "space-between" }}>
          <strong>Shift the national environment <InfoTip term="environment" /></strong>
          <span className="num" style={{ color: shift > 0 ? "var(--dem)" : shift < 0 ? "var(--rep)" : "var(--ink-muted)" }}>
            {shift === 0 ? "No shift" : `${Math.abs(shift)} pts toward ${shift > 0 ? "Democrats" : "Republicans"}`}
          </span>
        </label>
        <input id="shift" type="range" min={-10} max={10} step={0.5} value={shift} onChange={(e) => setShift(+e.target.value)} className="slider"
          aria-valuetext={shift === 0 ? "No shift" : `${Math.abs(shift)} points toward ${shift > 0 ? "Democrats" : "Republicans"}`} />
        <div className="small muted" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>← Republicans</span><span className="hide-sm">A polling miss like 2020’s was about 4 points</span><span>Democrats →</span></div>
      </section>

      <section className="block">
        {tab === "s" ? (
          <>
            <h2 className="display">Click a state</h2>
            <p className="takeaway small">Each click cycles: model → Democratic (or independent) win → Republican win → back to the model. The number on each state is the favorite’s chance out of 100. {nPicked > 0 && <strong>{nPicked} picked.</strong>}</p>
            <SenateTiles meta={meta} res={res} picks={picks} onCycle={cycle} reduce={!!reduce} />
          </>
        ) : (
          <>
            <h2 className="display">Call House races</h2>
            <p className="takeaway small">The {officeRaces.filter((r) => r.c != null).length} races the model sees as at least somewhat in play, closest first. Seats that are out of reach either way are counted for their favorite. {nPicked > 0 && <strong>{nPicked} picked.</strong>}</p>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by state or candidate" aria-label="Filter House races" className="field" />
            <HouseList meta={meta} res={res} picks={picks} onSet={set} q={q} />
          </>
        )}
      </section>

      <section className="block">
        <div className="grid-2">
          {(["D", "R"] as const).map((party) => {
            const path = pathTo(meta, res, tab, party);
            const allP = path.steps.reduce((a, s) => a * s.p, 1);
            return (
              <div key={party}>
                <h3 style={{ color: party === "D" ? "var(--dem)" : "var(--rep)" }}>{party === "D" ? "Democrats’" : "Republicans’"} likeliest path to {path.need} <InfoTip term="path" /></h3>
                <p className="small muted" style={{ margin: "4px 0 8px" }}>
                  Start with <strong className="num">{path.banked}</strong> seats that are{tab === "s" ? " not up or" : ""} already very likely (95+ in 100){path.steps.length ? <>, then win:</> : path.reachable ? <> — that’s already a majority.</> : "."}
                </p>
                <ol className="path">
                  <AnimatePresence initial={false}>
                    {path.steps.slice(0, 14).map((s) => (
                      <motion.li key={s.r.id} layout={!reduce} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
                        <Link href={`/race/${s.r.id}/`}>{s.r.t}</Link> <span className="small muted num">{in100(s.p)} in 100</span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>
                {path.steps.length > 14 && <p className="small muted">…and {path.steps.length - 14} more.</p>}
                {!path.reachable && <p className="small">No path to a majority in this scenario.</p>}
                {path.steps.length > 0 && <p className="small muted">Winning every race on this list: about <span className="num">{in100(allP)}</span> in 100 if they were independent — higher in reality, because they tend to move together.</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="block">
        <h2 className="display">Seats in your scenario</h2>
        <p className="takeaway small">How many seats Democrats{tab === "s" ? " and allied independents" : ""} win across the simulations that fit your picks.</p>
        <Histogram hist={ch.hist} maj={maj} reduce={!!reduce} />
      </section>
    </div>
  );
}

function Loading() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Loading simulations">
      <div className="skeleton" style={{ height: 40, width: 220, margin: "40px 0 16px" }} />
      <div className="skeleton" style={{ height: 20, maxWidth: 560, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 120, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 360 }} />
      <p className="small muted" style={{ marginTop: 12 }}>Loading 4,000 simulated elections…</p>
    </div>
  );
}

function SeatMeter({ d, total, maj, label }: { d: number; total: number; maj: number; label: string }) {
  return (
    <div style={{ minWidth: 240, flex: 1, maxWidth: 420 }}>
      <div className="row small" style={{ justifyContent: "space-between" }}>
        <span style={{ color: "var(--dem)" }}><strong className="num"><CountUp value={d} /></strong> D</span>
        <span className="muted">median {label} seats</span>
        <span style={{ color: "var(--rep)" }}>R <strong className="num"><CountUp value={total - d} /></strong></span>
      </div>
      <div className="bar" style={{ height: 14, marginTop: 6, position: "relative" }}>
        <motion.div animate={{ width: `${(d / total) * 100}%` }} transition={{ type: "spring", stiffness: 140, damping: 22 }} style={{ background: "var(--d-safe)" }} />
        <div style={{ flex: 1, background: "var(--r-safe)" }} />
        <div style={{ position: "absolute", left: `${(maj / total) * 100}%`, top: -4, bottom: -4, width: 2, background: "var(--ink)" }} aria-hidden="true" />
      </div>
      <div className="small muted" style={{ textAlign: "center", marginTop: 2 }}>{maj} for a majority</div>
    </div>
  );
}

function SenateTiles({ meta, res, picks, onCycle, reduce }: { meta: WMeta; res: ReturnType<typeof compute>; picks: Picks; onCycle: (id: string) => void; reduce: boolean }) {
  const byState: Record<string, WRace> = {};
  for (const r of meta.races) if (r.o === "s") byState[r.st] = r;
  return (
    <svg viewBox="0 0 12 8.2" width="100%" style={{ display: "block", maxWidth: 760, margin: "0 auto", touchAction: "manipulation" }} role="group" aria-label="Senate races by state">
      {Object.entries(TILES).map(([st, [c, rr]]) => {
        const r = byState[st];
        if (!r) return (
          <g key={st} transform={`translate(${c + 0.04},${rr + 0.04})`} aria-hidden="true">
            <rect width={0.92} height={0.92} rx={0.04} fill="var(--uncalled)" />
            <text x={0.46} y={0.54} textAnchor="middle" fontSize={0.24} fill="var(--ink-muted)">{st}</text>
          </g>
        );
        const pk = picks[r.id];
        const p = res.p[r.id];
        const b = bucketOf(p, r.dp, r.rp);
        const fill = pk ? partyFill(pk === "dside" ? r.dp : r.rp) : bucketVar(b);
        const label = pk ? "on-strong" : undefined;
        return (
          <g key={st} transform={`translate(${c + 0.04},${rr + 0.04})`}>
            <motion.g role="button" tabIndex={0}
              aria-label={`${r.t}: ${pk ? `you picked ${pk === "dside" ? r.dn : r.rn}` : `${BUCKET_LABEL[b]}, ${r.dn} ${in100(p)} in 100`}. Activate to change.`}
              onClick={() => onCycle(r.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCycle(r.id); } }}
              whileTap={reduce ? undefined : { scale: 0.88 }} whileHover={reduce ? undefined : { scale: 1.06 }}
              style={{ transformBox: "fill-box", transformOrigin: "center", cursor: "pointer", outline: "none" }}>
              <motion.rect width={0.92} height={0.92} rx={0.04} animate={{ fill }} transition={{ duration: reduce ? 0 : 0.35 }}
                stroke={pk ? "var(--ink)" : "none"} strokeWidth={pk ? 0.05 : 0} />
              <text x={0.46} y={0.42} textAnchor="middle" fontSize={0.24} fontWeight={700} fill={label ? "var(--on-strong)" : onBucket(b)} pointerEvents="none">{st}</text>
              <text x={0.46} y={0.72} textAnchor="middle" fontSize={0.17} fill={label ? "var(--on-strong)" : onBucket(b)} pointerEvents="none" className="num">
                {pk ? "✓ " + last(pk === "dside" ? r.dn : r.rn) : `${in100(p >= 0.5 ? p : 1 - p)}`}
              </text>
            </motion.g>
          </g>
        );
      })}
    </svg>
  );
}

function HouseList({ meta, res, picks, onSet, q }: { meta: WMeta; res: ReturnType<typeof compute>; picks: Picks; onSet: (id: string, v: Pick | null) => void; q: string }) {
  const rows = meta.races.filter((r) => r.o === "h" && r.c != null)
    .filter((r) => !q || `${r.t} ${r.dn} ${r.rn} ${r.st}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Math.abs(res.p[a.id] - 0.5) - Math.abs(res.p[b.id] - 0.5) || a.id.localeCompare(b.id));
  const [limit, setLimit] = useState(30);
  return (
    <div>
      <ul className="house-picks">
        {rows.slice(0, limit).map((r) => {
          const pk = picks[r.id], p = res.p[r.id], b = bucketOf(p, r.dp, r.rp);
          return (
            <li key={r.id}>
              <span className="swatch" style={{ background: pk ? partyFill(pk === "dside" ? r.dp : r.rp) : bucketVar(b) }} aria-hidden="true" />
              <span className="grow"><Link href={`/race/${r.id}/`}>{r.t}</Link><br /><span className="small muted num">{last(r.dn)} {in100(p)} · {last(r.rn)} {in100(1 - p)}</span></span>
              <span className="toggle small-toggle" role="group" aria-label={`Pick ${r.t}`}>
                <button aria-pressed={pk === "dside"} onClick={() => onSet(r.id, pk === "dside" ? null : "dside")} title={r.dn ?? ""}>{r.dp}</button>
                <button aria-pressed={!pk} onClick={() => onSet(r.id, null)}>Model</button>
                <button aria-pressed={pk === "rside"} onClick={() => onSet(r.id, pk === "rside" ? null : "rside")} title={r.rn ?? ""}>{r.rp}</button>
              </span>
            </li>
          );
        })}
      </ul>
      {rows.length > limit && <button className="btn" onClick={() => setLimit((l) => l + 40)}>Show more ({rows.length - limit} left)</button>}
      {!rows.length && <p className="muted">No race matches “{q}”.</p>}
    </div>
  );
}

function Histogram({ hist, maj, reduce }: { hist: Map<number, number>; maj: number; reduce: boolean }) {
  const entries = [...hist.entries()].sort((a, b) => a[0] - b[0]);
  if (!entries.length) return null;
  const tot = entries.reduce((a, [, c]) => a + c, 0);
  const lo = Math.min(entries[0][0], maj - 3), hi = Math.max(entries[entries.length - 1][0], maj + 3);
  const n = hi - lo + 1;
  const max = Math.max(...entries.map(([, c]) => c / tot));
  const bw = Math.min(40, 720 / n), W = bw * n, H = 180;
  const m = new Map(entries);
  const tickStep = n > 60 ? 10 : 5;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" role="img" aria-label="Seat distribution in your scenario" style={{ display: "block", maxWidth: W * 1.2, margin: "0 auto" }}>
      {Array.from({ length: n }, (_, i) => {
        const s = lo + i, v = (m.get(s) ?? 0) / tot, h = (v / max) * H;
        return <motion.rect key={s} x={i * bw + 0.5} width={Math.max(bw - 1, 0.5)} rx={1} initial={false}
          animate={{ y: H - h, height: h }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 24 }}
          fill={s >= maj ? "var(--d-likely)" : "var(--r-likely)"} />;
      })}
      <line x1={(maj - lo) * bw} x2={(maj - lo) * bw} y1={0} y2={H} stroke="var(--ink)" strokeDasharray="3 3" />
      <text x={(maj - lo) * bw + 4} y={12} fontSize={12} fill="var(--ink-muted)">{maj}</text>
      {Array.from({ length: n }, (_, i) => lo + i).filter((s) => s % tickStep === 0).map((s) => (
        <text key={s} x={(s - lo + 0.5) * bw} y={H + 18} fontSize={12} textAnchor="middle" fill="var(--ink-muted)">{s}</text>
      ))}
    </svg>
  );
}

function css(v: string) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888"; }

function saveImage(meta: WMeta, res: ReturnType<typeof compute>, tab: "s" | "h", shift: number) {
  const c = document.createElement("canvas");
  const W = 1200, H = 630;
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = css("--surface"); g.fillRect(0, 0, W, H);
  const serif = getComputedStyle(document.body).getPropertyValue("--font-display") || "Georgia, serif";
  const sans = getComputedStyle(document.body).getPropertyValue("--font-sans") || "system-ui, sans-serif";
  const ch = res.chamber[tab];
  const name = tab === "s" ? "Senate" : "House";
  g.fillStyle = css("--ink-muted"); g.font = `600 22px ${sans}`; g.fillText("MY 2026 " + name.toUpperCase() + " SCENARIO", 60, 80);
  g.fillStyle = css("--ink"); g.font = `600 56px ${serif}`;
  const lead = ch.D >= ch.R ? "Democrats" : "Republicans";
  g.fillText(`${lead} win the ${name}`, 60, 150);
  g.fillText(`in ${in100(Math.max(ch.D, ch.R))} of 100 simulations`, 60, 214);
  g.font = `400 24px ${sans}`; g.fillStyle = css("--ink-muted");
  g.fillText(`Median seats: ${ch.medianD} D · ${(tab === "s" ? 100 : 435) - ch.medianD} R${shift ? ` · national shift ${Math.abs(shift)} pts toward ${shift > 0 ? "D" : "R"}` : ""}`, 60, 262);
  if (tab === "s") {
    const size = 44, ox = 60, oy = 300;
    const byState: Record<string, WRace> = {};
    for (const r of meta.races) if (r.o === "s") byState[r.st] = r;
    for (const [st, [cx, cy]] of Object.entries(TILES)) {
      const r = byState[st];
      let fill = css("--uncalled"), text = css("--ink-muted");
      if (r) {
        const p = res.p[r.id], b = bucketOf(p, r.dp, r.rp);
        fill = css(b.startsWith("i-") ? "--ind-fill" : `--${b}`);
        text = b.endsWith("safe") || b.endsWith("likely") || b.startsWith("i-") ? css("--on-strong") : css("--ink");
      }
      g.fillStyle = fill; g.fillRect(ox + cx * (size + 4), oy + cy * (size + 4), size, size);
      g.fillStyle = text; g.font = `600 15px ${sans}`; g.textAlign = "center";
      g.fillText(st, ox + cx * (size + 4) + size / 2, oy + cy * (size + 4) + size / 2 + 5); g.textAlign = "left";
    }
  }
  g.fillStyle = css("--ink"); g.font = `600 30px ${serif}`; g.fillText("Bellwether", W - 230, H - 40);
  g.fillStyle = css("--ink-muted"); g.font = `400 16px ${sans}`; g.fillText(`Forecast as of ${meta.asof}`, W - 230, H - 16);
  const a = document.createElement("a");
  a.download = `bellwether-${name.toLowerCase()}-scenario.png`;
  a.href = c.toDataURL("image/png");
  a.click();
}
