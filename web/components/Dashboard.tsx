"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { CompactRow, Mover, Upcoming } from "@/lib/data";
import UpcomingList from "./Upcoming";
import YourRaces from "./YourRaces";
import { ZipBox } from "./ZipFinder";
import Sparkline, { Delta } from "./Sparkline";
import TimeChart from "./TimeChart";
import { fmtDate, fmtUpdated, in100, partyMarginLabel, surname } from "@/lib/format";
import type { Forecast, Version } from "@/lib/types";
import NewsStrip from "./NewsStrip";
import type { NewsItem } from "@/lib/newstypes";
import Hero from "./Hero";
import HouseHexMap from "./HouseHexMap";
import SectionNav from "./SectionNav";
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
import { flipLong, flipOf, flipShort, isRedrawnHouse } from "@/lib/flips";
import { useVersion, VersionProvider, VersionToggle } from "./VersionContext";

type History = { backcast_until: string | null; points: { date: string; senate: Record<string, number>; house: Record<string, number> }[] } | null;
type Props = { forecast: Forecast; rows: CompactRow[]; history: History; sparks: Record<string, number[]>; movers: Mover[]; upcoming: Upcoming[]; news: NewsItem[] };

export default function Dashboard(props: Props) {
  return (
    <VersionProvider initial={props.forecast.default_version}>
      <TipProvider><Inner {...props} /></TipProvider>
    </VersionProvider>
  );
}

export function mapItems(rows: CompactRow[], v: Version): MapItem[] {
  return rows.map((r) => {
    const f = flipOf(r, v);
    return { state: r.state, id: r.id, bucket: r.rating[v], title: r.title, flip: f?.tier,
      tipLines: <>{tipLinesFor(r.dside.name, r.dside.party, r.rside.name, r.rside.party, r.p[v])}{f && <><br /><span className="flip-chip">{flipShort(f)}</span></>}</> };
  });
}

function Inner({ forecast: f, rows, history, sparks, movers, upcoming, news }: Props) {
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
      <header className="masthead">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="kicker">2026 midterm forecast · {f.days_to_election} days to go</div>
            <h1>Who will control Congress?</h1>
            <p className="dek">Our model simulates the Nov. 3 election {f.n_sims.toLocaleString()} times using polls, each race’s partisan lean and the national mood. Updated {fmtUpdated(f.updated)}.</p>
          </div>
          <div style={{ paddingTop: 6 }}><VersionToggle /></div>
        </div>
      </header>
      <Hero f={f} v={v} rows={rows.filter((r) => r.office !== "governor")} />
      <NewsStrip items={news} />
      <section className="block" style={{ paddingTop: 16, borderTop: 0 }}>
        <div className="intro" aria-label="How to read this forecast">
          <div><div className="step">1</div><h3>Odds, not predictions <InfoTip term="odds" /></h3><p>We simulate the election {f.n_sims.toLocaleString()} times. “{in100(Math.max(ch.senate.p_control.D, ch.senate.p_control.R))} in 100” means that side won {in100(Math.max(ch.senate.p_control.D, ch.senate.p_control.R))} of every 100 runs — the other side still wins sometimes.</p></div>
          <div><div className="step">2</div><h3>Polls plus context <InfoTip term="fundamentals" /></h3><p>Each race blends its polling average with the state’s partisan lean and the national mood. The closer to Election Day, the more polls count.</p></div>
          <div><div className="step">3</div><h3>Races move together <InfoTip term="simulation" /></h3><p>If polls miss in one state, they usually miss in similar ones too. That’s built in, so upsets come in bunches like they do in real life.</p></div>
        </div>
      </section>

      <div className="home-tools">
        <div><h3 style={{ marginBottom: 8 }}>What’s on your ballot?</h3><ZipBox /></div>
        <div style={{ flex: "1 1 320px", maxWidth: 520 }}><h3 style={{ marginBottom: 8 }}>Coming up</h3><UpcomingList items={upcoming} limit={3} /></div>
      </div>
      <YourRaces rows={rows} v={v} />
      <SectionNav items={[["watch", "Races to watch"], ["flips", "Likely to flip"], ["senate", "Senate"], ["house", "House"], ["governors", "Governors"], ["trends", "Trends"], ["markets", "Markets"], ["changes", "What changed"], ["environment", "National mood"]]} />
      <Reveal>
        <section className="block" aria-labelledby="watch-h" id="watch">
          <h2 id="watch-h" className="display big">Races to watch</h2>
          <p className="takeaway">The closest Senate and governor contests right now.</p>
          <div className="race-card-grid">
            {close([...senate, ...gov], 8).map((r) => {
              const b = r.rating[v];
              const pl = r.p[v];
              return (
                <Link key={r.id} href={`/race/${r.id}/`} className={`race-card${flipOf(r, v) ? " flip" : ""}`}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="kicker">{r.office === "senate" ? "Senate" : "Governor"}</span>
                    <span className="chip" style={{ background: bucketVar(b), color: onBucket(b) }}>{BUCKET_LABEL[b]}</span>
                  </div>
                  {flipOf(r, v) && <div style={{ marginTop: 6 }}><span className={`flip-chip${flipOf(r, v)!.tier === "could" ? " could" : ""}`}>{flipShort(flipOf(r, v)!)}</span></div>}
                  <div style={{ fontWeight: 600, fontSize: 18, margin: "6px 0 8px" }}>{r.title}</div>
                  <div className="row small" style={{ justifyContent: "space-between" }}>
                    <span style={{ color: r.dside.party === "D" ? "var(--dem)" : "var(--ind)" }}>{surname(r.dside.name)} <strong className="num">{in100(pl)}</strong></span>
                    <span style={{ color: "var(--rep)" }}><strong className="num">{in100(1 - pl)}</strong> {surname(r.rside.name)}</span>
                  </div>
                  <div className="bar" style={{ marginTop: 6 }} aria-hidden="true">
                    <div style={{ width: `${pl * 100}%`, background: r.dside.party === "D" ? "var(--d-safe)" : "var(--ind-fill)", transition: "width .6s" }} />
                    <div style={{ flex: 1, background: "var(--r-safe)" }} />
                  </div>
                  {sparks[r.id] && (
                    <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                      <Sparkline values={sparks[r.id]} dParty={r.dside.party} rParty={r.rside.party} w={96} h={24} label={`${r.title}: ${r.dside.name}'s chance over the last month`} />
                      {sparks[r.id].length >= 8 && <Delta from={sparks[r.id][sparks[r.id].length - 8]} to={sparks[r.id][sparks[r.id].length - 1]} dName={r.dside.name} rName={r.rside.name} dParty={r.dside.party} rParty={r.rside.party} />}
                    </div>
                  )}
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

      <FlipSection rows={rows} v={v} />

      <section className="block" aria-labelledby="senate-h" id="senate">
        <h2 id="senate-h" className="display big">Senate</h2>
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

      <Reveal><section className="block" aria-labelledby="house-h" id="house">
        <h2 id="house-h" className="display big">House</h2>
        <p className="takeaway">
          Democrats win a median of <strong className="num">{Math.round(hMed)}</strong> seats (218 is a majority); in 80 of 100 simulations they win <span className="num">{ch.house.p80[0]}</span>–<span className="num">{ch.house.p80[1]}</span>. District lines reflect the 2026 maps, including the ten states that redrew mid-decade.
        </p>
        <HouseHexMap rows={house} v={v} />
        <div style={{ marginTop: 8 }}><Legend showInd /></div>
        <div className="grid-2" style={{ marginTop: 32 }}>
          <div>
            <h3>100 simulated Houses <InfoTip term="simulation" /></h3>
            <p className="takeaway small">Seats won by Democrats in each simulation. Blue dots reach 218.</p>
            <SeatDots key={v + "h"} hist={ch.house.seats_hist} majority={218} label="Distribution of Democratic House seats across simulations" partyAt={(s) => (s >= 218 ? "D" : "R")} />
            <h3 style={{ marginTop: 24 }}>Closest House races</h3>
            <ul style={{ paddingLeft: 18, margin: "8px 0 0" }}>
              {close(house, 8).map((r) => <li key={r.id}><Link href={`/race/${r.id}/`}>{r.title}</Link> <span className="small muted num">{surname(r.dside.name)} {in100(r.p[v])} · {surname(r.rside.name)} {in100(1 - r.p[v])}</span></li>)}
            </ul>
          </div>
        </div>
      </section></Reveal>

      <Reveal><section className="block" aria-labelledby="gov-h" id="governors">
        <h2 id="gov-h" className="display big">Governors</h2>
        <p className="takeaway">36 states elect governors. Democrats win an average of <strong className="num">{ch.governor.mean_won.D.toFixed(1)}</strong> of them and Republicans <strong className="num">{ch.governor.mean_won.R.toFixed(1)}</strong>.</p>
        <StateMap items={mapItems(gov, v)} title="Governor forecast map" notUpLabel="No governor’s race in 2026" />
        <div style={{ marginTop: 16 }}><RaceList rows={close(gov, 6)} v={v} caption="Closest governor races" /></div>
      </section></Reveal>

      {history && history.points.length > 1 && (
        <section className="block" aria-labelledby="time-h" id="trends">
          <h2 id="time-h" className="display big">How the odds have moved</h2>
          <p className="takeaway">Chance of Democratic control (polls + fundamentals). Use the buttons to zoom in or out, like a stock chart.{history.backcast_until && <> Points before {fmtDate(history.backcast_until, { month: "short", day: "numeric", year: "numeric" })} are recomputed from the polls available on each date, since the site launched then.</>}</p>
          <div className="grid-2">
            {(["senate", "house"] as const).map((c) => (
              <div key={c}>
                <h3 style={{ textTransform: "capitalize" }}>{c}</h3>
                <TimeChart title={`Chance of ${c} control over time`} yDomain={[0, 100]} yFormat={(n) => `${Math.round(n)}`} height={230}
                  zeroLine={{ y: 50 }} defaultRange="3M"
                  deltaFormat={(d) => Math.abs(d) < 0.5 ? { text: "No change", color: "var(--ink-muted)" } : { text: `${d > 0 ? "Democrats" : "Republicans"} +${Math.abs(d).toFixed(0)}`, color: d > 0 ? "var(--dem)" : "var(--rep)" }}
                  series={[
                    { key: "D", label: "Democrats", color: "var(--dem)", values: history.points.map((p) => ({ date: p.date, y: p[c].D * 100 })) },
                    { key: "R", label: "Republicans", color: "var(--rep)", values: history.points.map((p) => ({ date: p.date, y: p[c].R * 100 })) },
                  ]} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="block" aria-labelledby="mkt-h" id="markets">
        <h2 id="mkt-h" className="display big">Model vs. markets</h2>
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

      <section className="block" aria-labelledby="chg-h" id="changes">
        <h2 id="chg-h" className="display big">What changed</h2>
        {movers.length > 0 && (
          <>
            <p className="takeaway">Biggest movers over the past week, by change in win probability.</p>
            <div className="race-card-grid" style={{ marginBottom: 24 }}>
              {movers.map((m) => (
                <Link key={m.id} href={`/race/${m.id}/`} className="race-card">
                  <div className="kicker">{m.office === "senate" ? "Senate" : m.office === "house" ? "House" : "Governor"}</div>
                  <div style={{ fontWeight: 600, margin: "4px 0 6px" }}>{m.title}</div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    {sparks[m.id] ? <Sparkline values={sparks[m.id]} dParty={m.dside.party} rParty={m.rside.party} w={96} h={24} /> : <span />}
                    <Delta from={m.from} to={m.to} dName={m.dside.name} rName={m.rside.name} dParty={m.dside.party} rParty={m.rside.party} />
                  </div>
                  <div className="small muted num" style={{ marginTop: 4 }}>{surname(m.dside.name)} {in100(m.from)} → {in100(m.to)} in 100</div>
                </Link>
              ))}
            </div>
            <h3>Update log</h3>
          </>
        )}
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

      <section className="block" aria-labelledby="env-h" id="environment">
        <h2 id="env-h" className="display big">The national environment</h2>
        <p className="takeaway">
          The generic-ballot average is <strong className="num">{partyMarginLabel(f.national.generic_avg)}</strong> and the president’s net approval is <strong className="num">{f.national.approval_net.toFixed(1)}</strong>. Blending the two, the model expects a national environment of <strong className="num">{partyMarginLabel(f.national.environment)}</strong>, give or take about <span className="num">{f.national.environment_sd.toFixed(1)}</span> points.{" "}
          <Link href="/polls/">See the trackers →</Link>
        </p>
      </section>
    </div>
  );
}

/** Seats that the model expects to change parties, closest-to-certain first, in both directions. */
function FlipSection({ rows, v }: { rows: CompactRow[]; v: Version }) {
  const items = rows.map((r) => ({ r, f: flipOf(r, v) })).filter((x): x is { r: CompactRow; f: NonNullable<ReturnType<typeof flipOf>> } => !!x.f && x.f.tier === "likely")
    .sort((a, b) => b.f.p - a.f.p);
  const could = rows.map((r) => flipOf(r, v)).filter((f) => f?.tier === "could").length;
  const groups = [["senate", "Senate"], ["governor", "Governors"], ["house", "House"]] as const;
  return (
    <Reveal>
      <section className="block" aria-labelledby="flips-h" id="flips">
        <h2 id="flips-h" className="display big">Likely to flip</h2>
        <p className="takeaway">
          Seats where the party favored to win is not the party that holds the seat today, listed in the order the model is surest.
          {" "}<strong className="num">{items.length}</strong> are likely to change parties (50 in 100 or better); <strong className="num">{could}</strong> more could (25–49 in 100). The count covers both directions.
        </p>
        <div className="flip-groups">
          {groups.map(([o, label]) => {
            const g = items.filter((x) => x.r.office === o);
            return (
              <div key={o}>
                <h3>{label} <span className="small muted">({g.length})</span></h3>
                {g.length === 0 ? <p className="small muted">None at 50 in 100 or better.</p> : (
                  <ul className="flip-list">
                    {g.slice(0, o === "house" ? 12 : 10).map(({ r, f }) => (
                      <li key={r.id}>
                        <Link href={`/race/${r.id}/`}><strong>{r.title}</strong></Link>
                        <span className="flip-chip" title={flipLong(f, in100, isRedrawnHouse(r))}>{f.from} → {f.to}</span>
                        <span className="small muted num">{in100(f.p)} in 100</span>
                      </li>
                    ))}
                    {g.length > (o === "house" ? 12 : 10) && <li className="small muted">and {g.length - (o === "house" ? 12 : 10)} more — <Link href={`/${o}/`}>see all {label.toLowerCase()}</Link></li>}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          “Holds the seat today” is the party of the current officeholder. In the ten states with new House maps (AL, CA, FL, LA, MO, NC, OH, TN, TX, UT) it is the party of the sitting member, whose district lines have changed.
        </p>
      </section>
    </Reveal>
  );
}
