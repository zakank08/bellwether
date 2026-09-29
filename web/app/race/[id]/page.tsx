import type { Metadata } from "next";
import Link from "next/link";
import PollChart from "@/components/RaceCharts";
import InfoTip from "@/components/InfoTip";
import { getForecast, getRace, getRaces } from "@/lib/data";
import { BUCKET_LABEL, bucketVar, fmtDate, in100, onBucket, PARTY_NAME, partyInk, partyMarginLabel } from "@/lib/format";
import type { RaceDetail } from "@/lib/types";

export function generateStaticParams() {
  return getRaces().map((r) => ({ id: r.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const r = getRace((await params).id);
  const office = { senate: "Senate", house: "House", governor: "Governor" }[r.office];
  return { title: `${r.title} ${office} forecast`, description: r.summary };
}

const OFFICE = { senate: "U.S. Senate", house: "U.S. House", governor: "Governor" } as const;
const signed = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`);

export default async function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r: RaceDetail = getRace(id);
  const f = getForecast();
  const v = f.default_version;
  const b = r.rating[v];
  const p = r.p[v];
  const m = r.model;
  const lastName = (s: string | null) => (s ?? "").split(" ").slice(-1)[0];
  const ml = (x: number | null | undefined) => (x == null ? "—" : `${x >= 0 ? lastName(r.dside.name) : lastName(r.rside.name)} +${Math.abs(x).toFixed(1)}`);
  const pollsPresent = (r.polls?.length ?? 0) > 0;
  return (
    <div className="wrap">
      <nav className="small muted" style={{ padding: "16px 0 0" }} aria-label="Breadcrumb">
        <Link href="/">Forecast</Link> / <Link href={`/${r.office}/`}>{OFFICE[r.office]}</Link> / {r.state_name}
      </nav>
      <section className="block" style={{ paddingTop: 16 }}>
        <div className="kicker">{OFFICE[r.office]}{r.special ? " · special election" : ""}{r.open ? " · open seat" : ""}</div>
        <h1 className="display" style={{ margin: "4px 0 12px" }}>{r.title}</h1>
        <span className="chip" style={{ background: bucketVar(b), color: onBucket(b) }}>{BUCKET_LABEL[b]}</span>
        {r.kind === "two_party" ? (
          <div className="grid-2" style={{ marginTop: 20 }}>
            <div>
              <div className="display" style={{ fontSize: 56, lineHeight: "56px", color: partyInk(p >= 0.5 ? r.dside.party : r.rside.party) }}>
                <span className="num">{in100(p >= 0.5 ? p : 1 - p)}</span><span style={{ fontSize: 24, color: "var(--ink-muted)" }}> in 100</span>
              </div>
              <p className="display" style={{ fontSize: 22, lineHeight: "28px", fontWeight: 500, margin: "8px 0" }}><span className="sr-only">Odds: </span>
                {p >= 0.5 ? r.dside.name : r.rside.name} wins in <span className="num">{in100(p >= 0.5 ? p : 1 - p)}</span> of 100 simulations; {p >= 0.5 ? r.rside.name : r.dside.name} wins in <span className="num">{in100(p >= 0.5 ? 1 - p : p)}</span>.
              </p>
              <div className="bar" aria-hidden="true" style={{ maxWidth: 420 }}>
                <div style={{ width: `${p * 100}%`, background: r.dside.party === "D" ? "var(--d-safe)" : "var(--ind-fill)" }} />
                <div style={{ width: `${(1 - p) * 100}%`, background: r.rside.party === "R" ? "var(--r-safe)" : "var(--ind-fill)" }} />
              </div>
              {r.p_runoff != null && r.rules.runoff && <p className="small">Chance no one clears 50% and the race goes to a December runoff: <strong className="num">{in100(r.p_runoff)} in 100</strong> (rough estimate from the projected margin).</p>}
            </div>
            <div>
              <p style={{ marginTop: 0 }}>{r.summary}</p>
              <p className="small muted">Projected margin {ml(r.interval.median)}; in 80 of 100 simulations the result falls between {ml(r.interval.p10)} and {ml(r.interval.p90)}.</p>
            </div>
          </div>
        ) : (
          <p style={{ marginTop: 16 }}>{r.summary}</p>
        )}
      </section>

      <section className="block">
        <h2 className="display">Candidates</h2>
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
          {r.candidates.map((c) => (
            <li key={c.name} className="card" style={{ padding: 12 }}>
              <strong style={{ color: partyInk(c.party) }}>{c.name}</strong>{c.incumbent ? <span className="chip" style={{ marginLeft: 6, background: "var(--uncalled)" }}>Incumbent</span> : null}
              <div className="small muted">{c.party_label}</div>
            </li>
          ))}
        </ul>
        <p className="small muted">Ballot list from Wikipedia’s 2026 {r.office === "governor" ? "gubernatorial" : r.office} elections page. Candidate bios, campaign links, fundraising and endorsements are coming in a later phase.</p>
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
    </div>
  );
}
