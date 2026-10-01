import type { Metadata } from "next";
import Link from "next/link";
import PollChart, { OddsChart } from "@/components/RaceCharts";
import { Gauge, OutcomeDist } from "@/components/RaceVisuals";
import InfoTip from "@/components/InfoTip";
import FollowButton from "@/components/FollowButton";
import LiveRacePanel from "@/components/LiveRacePanel";
import CountySection from "@/components/CountySection";
import EmbedCode from "@/components/EmbedCode";
import { getForecast, getRace, getRaces } from "@/lib/data";
import { BUCKET_LABEL, bucketVar, fmtDate, in100, onBucket, PARTY_NAME, partyInk, partyMarginLabel, surname } from "@/lib/format";
import { flipLong, flipOf, flipShort, isRedrawnHouse } from "@/lib/flips";
import type { RaceDetail } from "@/lib/types";

export function generateStaticParams() {
  return getRaces().map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const r = getRace((await params).id);
  const office = { senate: "Senate", house: "House", governor: "Governor" }[r.office];
  const image = { url: `/og/race/${r.id}.png`, width: 1200, height: 630, alt: `${r.title} ${office}: chance of winning, out of 100` };
  return {
    title: `${r.title} ${office} forecast`, description: r.summary,
    openGraph: { type: "website", siteName: "Bellwether", title: `${r.title} ${office} forecast`, description: r.summary, images: [image] },
    twitter: { card: "summary_large_image", title: `${r.title} ${office} forecast`, description: r.summary, images: [image.url] },
  };
}

const OFFICE = { senate: "U.S. Senate", house: "U.S. House", governor: "Governor" } as const;
const signed = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`);

export default async function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r: RaceDetail = getRace(id);
  const f = getForecast();
  const v = f.default_version;
  // Neighbors: the same office's contested races, closest first.
  const peers = getRaces().filter((x) => x.office === r.office && x.kind === "two_party").sort((a, b) => Math.abs(a.p[v] - 0.5) - Math.abs(b.p[v] - 0.5));
  const at = peers.findIndex((x) => x.id === r.id);
  const prevRace = at > 0 ? peers[at - 1] : null;
  const nextRace = at >= 0 && at < peers.length - 1 ? peers[at + 1] : at < 0 ? peers[0] : null;
  const b = r.rating[v];
  const p = r.p[v];
  const m = r.model;
  const lastName = (s: string | null) => surname(s);
  const ml = (x: number | null | undefined) => (x == null ? "—" : `${x >= 0 ? lastName(r.dside.name) : lastName(r.rside.name)} +${Math.abs(x).toFixed(1)}`);
  const pollsPresent = (r.polls?.length ?? 0) > 0;
  return (
    <div className="wrap">
      <nav className="small muted" style={{ padding: "16px 0 0" }} aria-label="Breadcrumb">
        <Link href="/">Forecast</Link> / <Link href={`/${r.office}/`}>{OFFICE[r.office]}</Link> / {r.state_name}
      </nav>
      <section className="block" style={{ paddingTop: 16 }}>
        <div className="kicker">{OFFICE[r.office]}{r.special ? " · special election" : ""}{r.open ? " · open seat" : ""} · <Link href={`/state/${r.state.toLowerCase()}/`}>All {r.state_name} races</Link></div>
        <h1 className="display" style={{ margin: "4px 0 12px" }}>{r.title}</h1>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="row" style={{ gap: 8 }}>
            <span className="chip" style={{ background: bucketVar(b), color: onBucket(b) }}>{BUCKET_LABEL[b]}</span>
            {flipOf(r, v) && <span className={`flip-chip${flipOf(r, v)!.tier === "could" ? " could" : ""}`}>{flipShort(flipOf(r, v)!)}</span>}
          </span>
          {r.kind === "two_party" && <div className="row" style={{ gap: 8 }}><Link className="btn" href={`/compare/?a=${r.id}`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Compare</Link><FollowButton id={r.id} p={p} title={r.title} /><EmbedCode id={r.id} title={r.title} /></div>}
        </div>
        {flipOf(r, v) && <p className="small" style={{ margin: "10px 0 0" }}>{flipLong(flipOf(r, v)!, in100, isRedrawnHouse(r))}</p>}
        {r.kind === "two_party" ? (
          <>
            <div className="faceoff">
              <Cand side={r.dside} odds={p} race={r} />
              <div className="gauge-wrap">
                <Gauge p={p} dColor={sideColor(r.dside.party)} rColor={sideColor(r.rside.party)} label={`${r.dside.name} ${in100(p)} in 100, ${r.rside.name} ${in100(1 - p)} in 100`} />
                <span className="small muted">chance of winning, out of 100</span>
              </div>
              <Cand side={r.rside} odds={1 - p} race={r} right />
            </div>
            <p className="display" style={{ fontSize: 22, lineHeight: "30px", fontWeight: 500, margin: "20px 0 8px", maxWidth: "42ch" }}>
              {p >= 0.5 ? r.dside.name : r.rside.name} wins in <span className="num">{in100(p >= 0.5 ? p : 1 - p)}</span> of 100 simulations.
            </p>
            <p style={{ margin: 0, maxWidth: "70ch" }}>{r.summary}</p>
            {r.swing && (
              <div className="notice" role="note">
                <span aria-hidden="true">⚡</span>
                <span><strong>Big move.</strong> {r.dside.name}’s chance went from {in100(r.swing.from)} to {in100(r.swing.to)} in 100 since {fmtDate(r.swing.since)}.{" "}
                  {r.swing.new_polls.length ? <>It follows new polling from {r.swing.new_polls.join(", ")}.</> : <>No new polls came in; the shift came from the national environment or a model update.</>}
                  {r.swing.n_polls <= 3 && <> This race has only {r.swing.n_polls} poll{r.swing.n_polls === 1 ? "" : "s"}, so single results move it a lot — treat it with extra caution.</>}</span>
              </div>
            )}
            {r.p_runoff != null && r.rules.runoff && <p className="small">Chance no one clears 50% and the race goes to a December runoff: <strong className="num">{in100(r.p_runoff)} in 100</strong> (rough estimate from the projected margin).</p>}
            {r.dist && (
              <div style={{ marginTop: 28 }}>
                <h3>Where the result could land <InfoTip term="odds" /></h3>
                <p className="takeaway small">Every simulated outcome, grouped in 2-point steps. Projected margin {ml(r.interval.median)}; 80 in 100 fall between {ml(r.interval.p10)} and {ml(r.interval.p90)}.</p>
                <OutcomeDist dist={r.dist} dName={lastName(r.dside.name)} rName={lastName(r.rside.name)} dColor={sideColor(r.dside.party)} rColor={sideColor(r.rside.party)} median={r.interval.median} />
              </div>
            )}
          </>
        ) : (
          <p style={{ marginTop: 16 }}>{r.summary}</p>
        )}
      </section>

      {r.kind === "two_party" && <LiveRacePanel raceId={r.id} title={r.title} dside={r.dside} rside={r.rside} mu0={r.margin[v] ?? null} sd0={r.interval?.p10 != null && r.interval?.p90 != null ? Math.max(2, (r.interval.p90 - r.interval.p10) / 2.563) : 8} rules={r.rules ?? {}} state={r.state} pBefore={p} />}
      <section className="block">
        <h2 className="display">The candidates</h2>
        <div className="bio-grid" style={{ marginTop: 12 }}>
          {[...r.candidates].sort((a, b) => Number(b.name === r.dside.name || b.name === r.rside.name) - Number(a.name === r.dside.name || a.name === r.rside.name)).map((c) => {
            const main = c.name === r.dside.name || c.name === r.rside.name;
            const money = c.name === r.dside.name ? r.money?.d : c.name === r.rside.name ? r.money?.r : null;
            return (
              <article key={c.name} className="bio-card" style={main ? undefined : { opacity: 0.85 }}>
                <div className="top">
                  <div className="avatar" style={{ background: sideColor(c.party), width: 44, height: 44, fontSize: 16 }} aria-hidden="true">{initials(c.name)}</div>
                  <div>
                    <strong style={{ fontSize: 17 }}>{c.name}</strong>{c.incumbent && <span className="chip" style={{ marginLeft: 6, background: "var(--uncalled)" }}>Incumbent</span>}
                    <div className="small muted">{c.party_label}{c.bio?.description ? ` · ${c.bio.description}` : ""}</div>
                  </div>
                </div>
                {c.bio?.bio && <p className="small" style={{ margin: 0 }}>{c.bio.bio} {c.bio.url && <a href={c.bio.url} target="_blank" rel="noopener noreferrer" className="muted">Wikipedia</a>}</p>}
                {money && <MoneyRows money={money} color={sideColor(c.party)} max={Math.max(r.money?.d?.receipts ?? 0, r.money?.r?.receipts ?? 0)} />}
                {(c.bio?.website) && <a href={c.bio.website} target="_blank" rel="noopener noreferrer" className="small">Official website ↗</a>}
                {!c.bio && main && <span className="small muted">No biography on file yet.</span>}
              </article>
            );
          })}
        </div>
        <p className="small muted">Ballot list and short bios from Wikipedia (CC BY-SA); websites from Wikidata{r.money ? "; fundraising from the FEC (cycle-to-date, latest report)" : ""}.</p>
      </section>

      {(r.office === "senate" || r.office === "house") && (
        <p className="small" style={{ marginTop: -8 }}><Link href="/whatif/">What if this race flips? Try it in the map builder →</Link></p>
      )}
      {r.kind === "two_party" && (
        <section className="block">
          <h2 className="display">Polls <InfoTip term="house" /></h2>
          <p className="takeaway">
            {pollsPresent ? <>The polling average stands at <strong>{ml(m?.poll_avg)}</strong> across {r.n_polls} poll{r.n_polls === 1 ? "" : "s"} testing {r.dside.name} against {r.rside.name}.</> : <>No public polls have tested {r.dside.name ?? "the Democratic side"} against {r.rside.name ?? "the Republican side"} yet.</>}
          </p>
          <PollChart race={r} />
          {pollsPresent && (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data cards">
                <thead><tr><th>Pollster</th><th>Dates</th><th className="r">Sample</th><th className="r">Result</th><th className="r">Adjusted</th><th className="r">Weight</th></tr></thead>
                <tbody>
                  {r.polls!.slice(0, 40).map((pl, i) => (
                    <tr key={i}>
                      <td data-label="Pollster">{pl.url ? <a href={pl.url} rel="noopener noreferrer" target="_blank">{pl.pollster}</a> : pl.pollster}{pl.grade && <span className="chip" style={{ marginLeft: 6, background: "var(--uncalled)" }}>{pl.grade}</span>}{(pl.partisan || pl.internal) && <span className="small muted"> · {pl.partisan ? `${pl.partisan} sponsor` : "internal"}</span>}{pl.sponsors?.length ? <div className="small muted">for {pl.sponsors.join(", ")}</div> : null}</td>
                      <td data-label="Dates" className="num">{fmtDate(pl.start)}–{fmtDate(pl.end)}</td>
                      <td data-label="Sample" className="r num">{pl.n ? pl.n.toLocaleString() : "—"} {pl.pop?.toUpperCase()}</td>
                      <td data-label="Result" className="r num">{ml(pl.raw)}</td>
                      <td data-label="Adjusted" className="r num" title={`House effect ${signed(pl.house_effect)}, population ${signed(pl.pop_adj)}, timeline ${signed(pl.timeline_adj)}`}>{ml(pl.adjusted)}</td>
                      <td data-label="Weight" className="r num">{pl.weight.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.polls!.length > 40 && <p className="small muted">Showing the 40 most recent of {r.polls!.length} polls.</p>}
            </div>
          )}
        </section>
      )}

      {r.kind === "two_party" && (
        <section className="block">
          <h2 className="display">Chance of winning over time</h2>
          <p className="takeaway">How this race’s odds have moved as polls and the national environment changed.</p>
          <OddsChart race={r} />
        </section>
      )}

      {m && (
        <section className="block">
          <h2 className="display">What’s driving the forecast</h2>
          <p className="takeaway">The model blends each estimate by how much to trust it right now. Polls get <strong className="num">{Math.round(m.poll_weight * 100)}%</strong> of the weight, {f.days_to_election} days out.</p>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                <tr><td>Polling average (after adjustments)</td><td className="r num">{ml(m.poll_avg)}</td><td className="small muted">{m.poll_se != null ? `±${(1.96 * m.poll_se).toFixed(1)} sampling range; effective ${m.n_eff} polls` : "no polls"}</td></tr>
                <tr><td>Partisan lean (Cook PVI, 2026 lines) <InfoTip term="pvi" /></td><td className="r num">{m.pvi == null ? "—" : partyMarginLabel(m.pvi)}</td><td className="small muted">roughly {Math.abs(2 * (m.pvi ?? 0)).toFixed(0)} points of margin vs. the nation</td></tr>
                <tr><td>National environment <InfoTip term="environment" /></td><td className="r num">{partyMarginLabel(m.national_env)}</td><td className="small muted">generic ballot + presidential approval</td></tr>
                {m.incumbent_history && <tr><td>Incumbent’s track record <InfoTip term="fundamentals" /></td><td className="r num">{ml(m.incumbent_history.carry)}</td><td className="small muted">In {m.incumbent_history.cycle} they ran {Math.abs(m.incumbent_history.over).toFixed(1)} pts {m.incumbent_history.over >= 0 ? "more Democratic" : "more Republican"} than the state’s lean predicted; half carries over (max 10)</td></tr>}
                <tr><td>Incumbency</td><td className="r num">{m.incumbency === 0 ? "none" : ml(m.incumbency)}</td><td className="small muted">{m.incumbency === 0 ? "open seat or incumbent not on ballot" : "incumbent’s side"}</td></tr>
                <tr><td>Fundamentals estimate</td><td className="r num">{ml(m.fundamentals)}</td><td className="small muted">±{m.fund_sd.toFixed(0)} typical error</td></tr>
                <tr><td>Expert ratings (average)</td><td className="r num">{ml(m.experts)}</td><td className="small muted">used only in the “+ Expert ratings” version</td></tr>
                <tr><td><strong>Forecast</strong></td><td className="r num"><strong>{ml(m.mean)}</strong></td><td className="small muted">±{m.sd.toFixed(1)} standard deviation, including {m.drift_sd.toFixed(1)} for movement before Election Day</td></tr>
              </tbody>
            </table>
          </div>
          <h3 style={{ marginTop: 24 }}>All three versions</h3>
          <ul>
            {f.versions.map((ver) => <li key={ver.id}>{ver.label}: {r.dside.name} <strong className="num">{in100(r.p[ver.id])}</strong> in 100 ({BUCKET_LABEL[r.rating[ver.id]]})</li>)}
          </ul>
        </section>
      )}

      {Object.keys(r.experts).length > 0 && (
        <section className="block">
          <h2 className="display">Published ratings</h2>
          <p className="takeaway small">Other forecasters’ ratings, as listed on Wikipedia. Shown for comparison; they feed only the “+ Expert ratings” version.</p>
          <div className="row">
            {Object.entries(r.experts).map(([k, val]) => <span key={k} className="chip" style={{ background: "var(--uncalled)", fontWeight: 500 }}>{k}: {val}</span>)}
          </div>
        </section>
      )}

      {r.office !== "house" && <CountySection state={r.state} stateName={r.state_name} raceId={r.id} />}
      <section className="block">
        <h2 className="display">Rules and notes</h2>
        <ul>
          {r.rules.rcv && <li>Ranked-choice voting in the general election. The forecast models the final two-candidate round.</li>}
          {r.rules.top_four && <li>Alaska uses a top-four primary, so more than one candidate from a party can be on the ballot.</li>}
          {r.rules.runoff && <li>Georgia requires a majority: if no candidate tops 50%, the top two meet in a runoff.</li>}
          {r.rules.top_two && <li>Top-two primary state: the two general-election candidates can be from the same party.</li>}
          {r.rules.jungle_nov && <li>Louisiana’s House races hold an all-party primary on Nov. 3 with a Dec. 12 runoff if no one tops 50%; the forecast is for which party ultimately holds the seat.</li>}
          {r.dside.party === "I" && <li>{r.dside.name} is an independent. Seats won by independents who haven’t said which party they’d caucus with are counted separately in chamber control.</li>}
          {r.poll_close_et && <li>Last polls close at {r.poll_close_et} Eastern.</li>}
          {r.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      </section>
      <p className="small muted" style={{ margin: "32px 0 8px" }}>{r.office === "senate" ? "Senate" : r.office === "house" ? "House" : "Governor"} races, closest first{at >= 0 ? ` · this is #${at + 1} of ${peers.length}` : ""}</p>
      <nav className="race-nav" aria-label="More races">
        {prevRace ? <Link href={`/race/${prevRace.id}/`}><div className="dir">← Previous</div><strong>{prevRace.title}</strong><div className="small muted">{BUCKET_LABEL[prevRace.rating[v]]}</div></Link> : <span />}
        {nextRace ? <Link href={`/race/${nextRace.id}/`} style={{ textAlign: "right" }}><div className="dir">Next →</div><strong>{nextRace.title}</strong><div className="small muted">{BUCKET_LABEL[nextRace.rating[v]]}</div></Link> : <span />}
      </nav>
    </div>
  );
}

const sideColor = (p: string | null) => (p === "D" ? "var(--d-safe)" : p === "R" ? "var(--r-safe)" : "var(--ind-fill)");
const initials = (n: string | null) => (n ?? "?").split(" ").filter((w) => /^[A-Z]/.test(w) && !/^(Jr|Sr|II|III)\.?$/.test(w)).map((w) => w[0]).slice(0, 2).join("") || "?";
const money$ = (n: number | null | undefined) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);

function Cand({ side, odds, race, right }: { side: { name: string | null; party: string | null }; odds: number; race: RaceDetail; right?: boolean }) {
  const c = race.candidates.find((x) => x.name === side.name);
  return (
    <div className={`cand${right ? " right" : ""}`}>
      <div className="avatar" style={{ background: sideColor(side.party) }} aria-hidden="true">{initials(side.name)}</div>
      <div className="name">{side.name}</div>
      <div className="small muted">{c?.party_label ?? side.party}{c?.incumbent ? " · incumbent" : ""}</div>
      <div className="odds num" style={{ color: side.party === "D" ? "var(--dem)" : side.party === "R" ? "var(--rep)" : "var(--ind)" }}>{in100(odds)}<span className="small muted" style={{ fontFamily: "var(--font-sans)", fontSize: 14 }}> in 100</span></div>
    </div>
  );
}

function MoneyRows({ money, color, max }: { money: { receipts: number | null; cash_on_hand: number | null; through: string }; color: string; max: number }) {
  return (
    <div>
      <div className="money-row"><span className="muted">Raised</span><div className="money-bar" style={{ width: `${max ? ((money.receipts ?? 0) / max) * 100 : 0}%`, background: color }} /><strong className="num">{money$(money.receipts)}</strong></div>
      <div className="money-row"><span className="muted">Cash on hand</span><div className="money-bar" style={{ width: `${max ? ((money.cash_on_hand ?? 0) / max) * 100 : 0}%`, background: color, opacity: 0.55 }} /><strong className="num">{money$(money.cash_on_hand)}</strong></div>
      {money.through && <div className="small muted">Through {money.through}</div>}
    </div>
  );
}
