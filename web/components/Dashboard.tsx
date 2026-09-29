"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { CompactRow } from "@/lib/data";
import { fmtUpdated, in100, partyMarginLabel } from "@/lib/format";
import type { Forecast, Version } from "@/lib/types";
import Headline from "./Headline";
import HouseWaffle from "./HouseWaffle";
import LineChart from "./LineChart";
import RaceList from "./RaceList";
import SeatDots from "./SeatDots";
import SnakeChart from "./SnakeChart";
import { Legend, tipLinesFor } from "./MapBits";
import StateMap from "./MapLazy";
import type { MapItem } from "./StateMap";
import { TipProvider } from "./Tooltip";
import InfoTip from "./InfoTip";
import Reveal from "./Reveal";
import { BUCKET_LABEL, bucketVar, onBucket } from "@/lib/format";
import { useVersion, VersionProvider, VersionToggle } from "./VersionContext";

type History = { points: { date: string; senate: Record<string, number>; house: Record<string, number> }[] } | null;

export default function Dashboard(props: { forecast: Forecast; rows: CompactRow[]; history: History }) {
  return (
    <VersionProvider initial={props.forecast.default_version}>
      <TipProvider><Inner {...props} /></TipProvider>
    </VersionProvider>
  );
}

export function mapItems(rows: CompactRow[], v: Version): MapItem[] {
  return rows.map((r) => ({ state: r.state, id: r.id, bucket: r.rating[v], title: r.title, tipLines: tipLinesFor(r.dside.name, r.dside.party, r.rside.name, r.rside.party, r.p[v]) }));
}

function Inner({ forecast: f, rows, history }: { forecast: Forecast; rows: CompactRow[]; history: History }) {
  const { v } = useVersion();
  const ch = f.chambers[v];
  const senate = useMemo(() => rows.filter((r) => r.office === "senate"), [rows]);
  const house = useMemo(() => rows.filter((r) => r.office === "house"), [rows]);
  const gov = useMemo(() => rows.filter((r) => r.office === "governor"), [rows]);
  const notUp = ch.senate.not_up!;
  const baseD = notUp.D + notUp.I_caucus_D;
  const close = (rs: CompactRow[], n: number) => rs.filter((r) => r.kind === "two_party").sort((a, b) => Math.abs(a.p[v] - 0.5) - Math.abs(b.p[v] - 0.5)).slice(0, n);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const sMed = ch.senate.median_seats.D;
  const hMed = ch.house.median_seats.D;

  return (
    <div className="wrap">
      <section className="block" style={{ paddingTop: 32 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="kicker">2026 midterm forecast</div>
            <p className="small muted" style={{ margin: "4px 0 0" }}>Updated {fmtUpdated(f.updated)} · {f.days_to_election} days until Nov. 3 · {f.n_sims.toLocaleString()} simulations</p>
          </div>
          <VersionToggle />
        </div>
        <div className="grid-2" style={{ marginTop: 24 }}>
          <Headline chamber="Senate" p={ch.senate.p_control} href="/senate/" />
          <Headline chamber="House" p={ch.house.p_control} href="/house/" />
        </div>
        <div className="intro" aria-label="How to read this forecast">
          <div><div className="step">1</div><h3>Odds, not predictions <InfoTip term="odds" /></h3><p>We simulate the election {f.n_sims.toLocaleString()} times. “{in100(Math.max(ch.senate.p_control.D, ch.senate.p_control.R))} in 100” means that side won {in100(Math.max(ch.senate.p_control.D, ch.senate.p_control.R))} of every 100 runs — the other side still wins sometimes.</p></div>
          <div><div className="step">2</div><h3>Polls plus context <InfoTip term="fundamentals" /></h3><p>Each race blends its polling average with the state’s partisan lean and the national mood. The closer to Election Day, the more polls count.</p></div>
          <div><div className="step">3</div><h3>Races move together <InfoTip term="simulation" /></h3><p>If polls miss in one state, they usually miss in similar ones too. That’s built in, so upsets come in bunches like they do in real life.</p></div>
        </div>
      </section>

      <Reveal>
        <section className="block" aria-labelledby="watch-h">
          <h2 id="watch-h" className="display">Races to watch</h2>
          <p className="takeaway">The closest Senate and governor contests right now.</p>
          <div className="race-card-grid">
            {close([...senate, ...gov], 8).map((r) => {
              const b = r.rating[v];
              const pl = r.p[v];
              return (
                <Link key={r.id} href={`/race/${r.id}/`} className="race-card">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="kicker">{r.office === "senate" ? "Senate" : "Governor"}</span>
                    <span className="chip" style={{ background: bucketVar(b), color: onBucket(b) }}>{BUCKET_LABEL[b]}</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 18, margin: "6px 0 8px" }}>{r.title}</div>
                  <div className="row small" style={{ justifyContent: "space-between" }}>
                    <span style={{ color: r.dside.party === "D" ? "var(--dem)" : "var(--ind)" }}>{r.dside.name?.split(" ").slice(-1)} <strong className="num">{in100(pl)}</strong></span>
                    <span style={{ color: "var(--rep)" }}><strong className="num">{in100(1 - pl)}</strong> {r.rside.name?.split(" ").slice(-1)}</span>
                  </div>
                  <div className="bar" style={{ marginTop: 6 }} aria-hidden="true">
                    <div style={{ width: `${pl * 100}%`, background: r.dside.party === "D" ? "var(--d-safe)" : "var(--ind-fill)", transition: "width .6s" }} />
                    <div style={{ flex: 1, background: "var(--r-safe)" }} />
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="cta">
            <div><strong style={{ fontSize: 18 }}>Think the polls are wrong?</strong><div className="small" style={{ opacity: 0.85 }}>Pick your own winners, shift the national mood, and share your map.</div></div>
            <Link href="/whatif/" className="btn">Build your own map →</Link>
          </div>
        </section>
      </Reveal>

      <section className="block" aria-labelledby="senate-h">
        <h2 id="senate-h" className="display">Senate</h2>
        <p className="takeaway">
          In a typical simulation Democrats and allied independents hold <strong className="num">{Math.round(sMed)}</strong> seats; in 80 of 100 they land between <span className="num">{ch.senate.p80[0]}</span> and <span className="num">{ch.senate.p80[1]}</span>. They need 51, since Vice President Vance breaks 50–50 ties for Republicans.
        </p>
        <StateMap items={mapItems(senate, v)} title="Senate forecast map" />
        <div style={{ marginTop: 12 }}><Legend showInd /></div>
        <div className="grid-2" style={{ marginTop: 32 }}>
          <div>
            <h3>100 simulated Senates <InfoTip term="simulation" /></h3>
            <p className="takeaway small">Each dot is one outcome: how many seats Democrats and allied independents hold. Blue dots reach 51.</p>
            <SeatDots key={v + "s"} hist={ch.senate.seats_hist} majority={51} label="Distribution of Democratic Senate seats across simulations"
              partyAt={(s) => (s >= 51 ? "D" : "R")} />
          </div>
          <div>
            <h3>Tipping-point races <InfoTip term="tipping" /></h3>
            <p className="takeaway small">The race most likely to hand one party its majority, across simulations.</p>
            <ol style={{ paddingLeft: 20, margin: 0 }}>
              {ch.senate.tipping.slice(0, 6).map((t) => (
                <li key={t.id} style={{ marginBottom: 6 }}>
                  <Link href={`/race/${t.id}/`}>{byId[t.id]?.title}</Link> <span className="muted small num">— tipping point in {in100(t.p)} of 100</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div style={{ marginTop: 32 }}>
          <h3>Every race, in order</h3>
          <p className="takeaway small">From the Democrats’ best chance to the Republicans’ best chance.</p>
          <SnakeChart rows={senate} v={v} baseD={baseD} needed={51} />
        </div>
        <div style={{ marginTop: 32 }}>
          <h3>Closest Senate races</h3>
          <RaceList rows={close(senate, 8)} v={v} caption="Closest Senate races" />
        </div>
      </section>

      <Reveal><section className="block" aria-labelledby="house-h">
        <h2 id="house-h" className="display">House</h2>
        <p className="takeaway">
          Democrats win a median of <strong className="num">{Math.round(hMed)}</strong> seats (218 is a majority); in 80 of 100 simulations they win <span className="num">{ch.house.p80[0]}</span>–<span className="num">{ch.house.p80[1]}</span>. District lines reflect the 2026 maps, including the ten states that redrew mid-decade.
        </p>
        <div className="grid-2">
          <div><HouseWaffle rows={house} v={v} /></div>
          <div>
            <h3>100 simulated Houses</h3>
            <p className="takeaway small">Seats won by Democrats in each simulation. Blue dots reach 218.</p>
            <SeatDots key={v + "h"} hist={ch.house.seats_hist} majority={218} label="Distribution of Democratic House seats across simulations" partyAt={(s) => (s >= 218 ? "D" : "R")} />
            <h3 style={{ marginTop: 24 }}>Closest House races</h3>
            <ul style={{ paddingLeft: 18, margin: "8px 0 0" }}>
              {close(house, 8).map((r) => <li key={r.id}><Link href={`/race/${r.id}/`}>{r.title}</Link> <span className="small muted num">{r.dside.name?.split(" ").slice(-1)} {in100(r.p[v])} · {r.rside.name?.split(" ").slice(-1)} {in100(1 - r.p[v])}</span></li>)}
            </ul>
          </div>
        </div>
      </section></Reveal>

      <Reveal><section className="block" aria-labelledby="gov-h">
        <h2 id="gov-h" className="display">Governors</h2>
        <p className="takeaway">36 states elect governors. Democrats win an average of <strong className="num">{ch.governor.mean_won.D.toFixed(1)}</strong> of them and Republicans <strong className="num">{ch.governor.mean_won.R.toFixed(1)}</strong>.</p>
        <StateMap items={mapItems(gov, v)} title="Governor forecast map" notUpLabel="No governor’s race in 2026" />
        <div style={{ marginTop: 16 }}><RaceList rows={close(gov, 6)} v={v} caption="Closest governor races" /></div>
      </section></Reveal>

      {history && history.points.length > 1 && (
        <section className="block" aria-labelledby="time-h">
          <h2 id="time-h" className="display">How the odds have moved</h2>
          <p className="takeaway">Chance of Democratic control, recalculated with only the polls available on each date (polls + fundamentals version).</p>
          <div className="grid-2">
            {(["senate", "house"] as const).map((c) => (
              <div key={c}>
                <h3 style={{ textTransform: "capitalize" }}>{c}</h3>
                <LineChart title={`Chance of ${c} control over time`} yDomain={[0, 100]} yFormat={(n) => `${Math.round(n)}`} height={220}
                  zeroLine={{ y: 50 }}
                  series={[
                    { key: "D", label: "Democrats", color: "var(--dem)", values: history.points.map((p) => ({ date: p.date, y: p[c].D * 100 })) },
                    { key: "R", label: "Republicans", color: "var(--rep)", values: history.points.map((p) => ({ date: p.date, y: p[c].R * 100 })) },
                  ]} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="block" aria-labelledby="mkt-h">
        <h2 id="mkt-h" className="display">Model vs. markets</h2>
        <p className="takeaway">Prediction markets are bets, not polls, and they are not an input to this forecast. They’re shown so you can see where traders disagree with the model.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Chamber</th><th className="r">Bellwether (D)</th>{[...new Set(f.markets.map((m) => m.source))].map((s) => <th key={s} className="r">{s} (D)</th>)}</tr></thead>
            <tbody>
              {(["senate", "house"] as const).map((c) => (
                <tr key={c}>
                  <td style={{ textTransform: "capitalize" }}>{c}</td>
                  <td className="r num"><strong>{in100(ch[c].p_control.D)}</strong></td>
                  {[...new Set(f.markets.map((m) => m.source))].map((s) => {
                    const m = f.markets.find((x) => x.source === s && x.chamber === c);
                    return <td key={s} className="r num">{m?.p.D != null ? <a href={m.url} rel="noopener noreferrer" target="_blank">{in100(m.p.D)}</a> : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">Market prices normalized so both parties sum to 100. Fetched with the forecast.</p>
      </section>

      <section className="block" aria-labelledby="chg-h">
        <h2 id="chg-h" className="display">What changed</h2>
        {f.changes.length ? (
          <ul style={{ paddingLeft: 18 }}>
            {f.changes.map((c) => (
              <li key={c.id} style={{ marginBottom: 8 }}>
                <Link href={`/race/${c.id}/`}><strong>{c.title}</strong></Link> <span className="small muted">({c.office})</span>: <span className="num">{in100(c.from)} → {in100(c.to)}</span> in 100 for the non-Republican side. {c.reason}
              </li>
            ))}
          </ul>
        ) : <p className="muted">No race moved by 3 or more points since the last update. The log fills in as daily runs accumulate.</p>}
      </section>

      <section className="block" aria-labelledby="env-h">
        <h2 id="env-h" className="display">The national environment</h2>
        <p className="takeaway">
          The generic-ballot average is <strong className="num">{partyMarginLabel(f.national.generic_avg)}</strong> and the president’s net approval is <strong className="num">{f.national.approval_net.toFixed(1)}</strong>. Blending the two, the model expects a national environment of <strong className="num">{partyMarginLabel(f.national.environment)}</strong>, give or take about <span className="num">{f.national.environment_sd.toFixed(1)}</span> points.{" "}
          <Link href="/polls/">See the trackers →</Link>
        </p>
      </section>
    </div>
  );
}
