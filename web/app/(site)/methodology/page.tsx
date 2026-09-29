import type { Metadata } from "next";
import { getBacktest, getForecast } from "@/lib/data";

export const metadata: Metadata = { title: "Methodology" };

function Calibration({ bins }: { bins: { bin: string; n: number; predicted: number; observed: number }[] }) {
  const W = 320, P = 36;
  const s = (v: number) => P + v * (W - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${W}`} width="100%" style={{ maxWidth: 320 }} role="img" aria-label="Calibration: predicted versus observed Democratic win rates">
      <rect x={P} y={P} width={W - 2 * P} height={W - 2 * P} fill="none" stroke="var(--line)" />
      <line x1={s(0)} y1={W - s(0)} x2={s(1)} y2={W - s(1)} stroke="var(--ink-muted)" strokeDasharray="3 3" />
      {bins.map((b) => <circle key={b.bin} cx={s(b.predicted)} cy={W - s(b.observed)} r={3 + Math.sqrt(b.n)} fill="var(--d-likely)" fillOpacity={0.6} stroke="var(--dem)" />)}
      <text x={W / 2} y={W - 8} textAnchor="middle" fontSize={12} fill="var(--ink-muted)">Forecast chance</text>
      <text x={12} y={W / 2} textAnchor="middle" fontSize={12} fill="var(--ink-muted)" transform={`rotate(-90 12 ${W / 2})`}>How often it happened</text>
    </svg>
  );
}

export default function Methodology() {
  const f = getForecast();
  const bt = getBacktest();
  return (
    <div className="wrap">
      <section className="block prose" style={{ paddingTop: 32 }}>
        <h1 className="display">How the forecast works</h1>
        <p>Bellwether simulates the 2026 election {f.n_sims.toLocaleString()} times. Each simulation draws a result for every Senate, House and governor race, with errors that move together the way real elections do. A party’s chance of winning is the share of simulations it wins. Model version {f.model_version}; data as of {f.asof}.</p>

        <h2 className="display">1. Races and district lines</h2>
        <p>The list of races, candidates, incumbents and each seat’s Cook Partisan Voting Index come from Wikipedia’s 2026 Senate, House and governor pages, which cite Cook’s 2026 PVI on the <em>new</em> district lines. Ten states changed congressional maps after summer 2025 (Alabama, California, Florida, Louisiana, Missouri, North Carolina, Ohio, Tennessee, Texas and Utah), so we never reuse 2022 lines. Hand corrections live in a versioned overrides file with a stated reason for each one.</p>
        <p>Special cases: Georgia requires a majority (we estimate the chance of a runoff); Maine and Alaska use ranked-choice voting (we model the final two-candidate round); California and Washington’s top-two primaries can produce same-party general elections (the seat’s party is then settled); Louisiana’s House seats hold an all-party primary on Nov. 3 with a Dec. 12 runoff (we forecast which party ends up holding the seat); independents run against Republicans in some states (Nebraska’s Dan Osborn, for example). Independents who haven’t said which party they’d caucus with are counted separately, which is why a sliver of simulations end with no party at a majority.</p>

        <h2 className="display">2. Polling averages</h2>
        <p>Polls come from the VoteHub Polling API. We keep polls that test the two leading candidates actually on the ballot. Each poll’s margin is adjusted three ways before averaging:</p>
        <ul>
          <li><strong>Likely voters.</strong> Registered-voter and adult polls are shifted by the average gap between those polls and likely-voter polls taken within two weeks of them, estimated from the generic ballot.</li>
          <li><strong>House effects.</strong> A pollster that consistently runs more Democratic or Republican than other pollsters of the same race is adjusted back toward the field. The estimate is shrunk toward zero (as if it had five extra neutral polls).</li>
          <li><strong>Timeline.</strong> An older poll is shifted by how much the national generic ballot has moved since it was taken (80% for Senate, 60% for governors, 100% for House).</li>
        </ul>
        <p>Weights: recency (14-day half-life, stretched up to 60 days when a race has fewer than three recent polls, so one new poll can’t erase the others), sample size (square root, capped at 3,000), pollster rating (0.35×–1.4×), half weight for partisan or internal polls, and divided by the square root of how many polls a pollster has in the race so no single firm dominates.</p>

        <h2 className="display">3. Fundamentals</h2>
        <p>Before polls, a race’s expected margin is: twice the Cook PVI (PVI is a share-point lean; margin is about double) + the national environment + an incumbency bonus (Senate 3 points, governor 4, House 2.5) + the incumbent’s track record. Governors’ races follow national partisanship less closely, so their lean is scaled by 0.75.</p>
        {f.house_calibration && (
          <p><strong>House calibration.</strong> Most House districts have no polls, so their fundamentals matter most. Each run we check the House formula against the 2024 results in the {f.house_calibration.n} contested districts whose lines haven’t changed since then (Wikipedia’s 2024 House results; the ten redrawn states are left out). In 2024, district margins followed partisan lean almost one-for-one ({f.house_calibration.elasticity.toFixed(2)}), incumbents ran about {f.house_calibration.incumbency.toFixed(1)} points ahead, and the typical miss was {f.house_calibration.resid_sd.toFixed(1)} points. We use those values, adding room for this year’s national uncertainty. House members who were already incumbents in 2024 also get half of how far they ran ahead of (or behind) their district that year.</p>
        )}
        <p><strong>Incumbent track record.</strong> Some incumbents consistently beat their state’s lean — Susan Collins won Maine by 8.6 points in 2020 while Biden carried it by 9. For a Senate or governor incumbent on the ballot, we take their last race in the historical file, compare the result with what the state’s lean and that year’s national environment predicted, and carry half the difference into this year (capped at 10 points either way). Added in model 0.2.0.</p>
        <p>The national environment blends the generic-ballot average with a structural midterm prior: the president’s party typically loses about 3 points of margin plus 0.4 points per point of net disapproval. Today the generic ballot gets {Math.round(f.national.generic_weight * 100)}% of that blend.</p>
        <p><strong>Fundraising.</strong> For Senate races and House races within about 20 points, we pull each principal candidate’s cycle-to-date receipts and cash on hand from the FEC and add 0.75 points per doubling of the receipts ratio, capped at ±2.5, when both sides have raised at least $50,000. Money partly follows expected competitiveness, so its signal is mostly already in the polls; the effect is kept small on purpose.</p>

        <h2 className="display">4. Blending polls and fundamentals</h2>
        <p>Each estimate is weighted by how precise it is. A polling average’s uncertainty is its sampling error plus how much averages typically drift before Election Day (0.6 points × √days) plus a 3-point allowance for systematic polling error. Fundamentals carry an 11-point (Senate), 14-point (governor) or 7-point (House) typical error. As the election approaches, drift shrinks and polls automatically gain weight.</p>
        <p>Three versions are published: <strong>Polls only</strong> (polls wherever they exist, fundamentals only where there are none), <strong>Polls + fundamentals</strong> (the default), and <strong>+ Expert ratings</strong>, which adds the average published rating (Solid = 22 points, Likely = 11, Lean = 5, Tilt = 2.5) as a third estimate with a 6.5-point error. Ratings are other outlets’ work; we show them with attribution only.</p>

        <h2 className="display">5. Correlated simulation</h2>
        <p>Every simulated margin = forecast margin + shared shocks + a race-specific shock. The shared shocks: a <strong>national</strong> swing (about {f.national.environment_sd.toFixed(1)} points today, governors at 0.75×); an industry-wide <strong>polling miss</strong> of about 2 points, applied in proportion to how poll-driven each race is; <strong>regional</strong> (Northeast, Midwest, South, West) and <strong>state</strong> swings of 1.5 points each (so a state’s Senate, governor and House races move together); and swings tied to each state’s <strong>college-degree, Hispanic and Black population shares</strong>. National and polling-miss draws use a fat-tailed t-distribution, because big misses (2016, 2020) happen more often than a bell curve says. The race-specific shock fills whatever variance is left so each race’s total uncertainty matches its forecast.</p>
        <p>Senate control: Democrats need 51 seats counting the 34 Democrats and allied independents not up this year; Republicans hold control at 50 because the vice president breaks ties. The <strong>tipping-point race</strong> is the one that supplies the decisive seat when every simulation’s races are sorted by margin.</p>

        <h2 className="display">6. Backtest</h2>
        {bt ? (
          <>
            <p>We ran the election-eve version of the model on {bt.overall.races} Senate and governor races from 2018, 2020 and 2022, rating pollsters without the tested year. It called {bt.overall.correct_calls} of {bt.overall.races} correctly, with a Brier score of {bt.overall.brier} (lower is better; always saying 50% scores 0.25). The two uncertainty settings above were chosen by this backtest (systematic polling error {bt.chosen.systematic_sd} points; fundamentals error ×{bt.chosen.fund_scale}).</p>
            <div className="row" style={{ alignItems: "flex-start", gap: 24 }}>
              <Calibration bins={bt.overall.calibration} />
              <div className="table-wrap" style={{ flex: 1, minWidth: 260 }}>
                <table className="data">
                  <thead><tr><th>Year</th><th className="r">Races</th><th className="r">Correct</th><th className="r">Brier</th><th className="r">Margin error</th><th className="r">Avg. miss</th></tr></thead>
                  <tbody>{Object.entries(bt.cycles).map(([y, s]: any) => (
                    <tr key={y}><td>{y}</td><td className="r num">{s.races}</td><td className="r num">{s.correct_calls}</td><td className="r num">{s.brier}</td><td className="r num">{s.margin_rmse}</td><td className="r num">{s.margin_bias > 0 ? "D" : "R"}+{Math.abs(s.margin_bias)}</td></tr>
                  ))}</tbody>
                </table>
                <p className="small muted">“Avg. miss” is the average amount the forecast overstated one party. 2020’s D+7 reflects that year’s industry-wide polling error, the kind the correlated polling-miss shock exists for.</p>
              </div>
            </div>
            <h3>Limits of this backtest</h3>
            <ul>{bt.limits.map((l: string, i: number) => <li key={i}>{l.replace(/\s+/g, " ")}</li>)}</ul>
          </>
        ) : <p>The backtest report hasn’t been generated yet.</p>}

        <h2 className="display">7. Charts over time</h2>
        <p>Odds-over-time charts go back to September 2025. The site launched on Sept. 28, 2026, so earlier points are a <strong>backcast</strong>: the same model rerun with only the polls that had been released by each date (weekly, then daily for the last 60 days, using fewer simulations per point). They use today’s candidate list and district lines, so they show how the evidence evolved rather than what a forecast published at the time would have said. From launch on, each point is the live forecast as published. Polling-average charts go back to each race’s first poll; presidential approval starts with the second Trump term.</p>
        <p>Use the range buttons (1W to 1Y, All, or Custom dates) to zoom. There’s no one-day view: forecasts update three times a day and polls arrive a few times a week, so a day is too short to show movement. Election night will get its own minute-by-minute view.</p>

        <h2 className="display">8. Sources</h2>
        <ul>{f.sources.map((s) => <li key={s.name}><a href={s.url} rel="noopener noreferrer" target="_blank">{s.name}</a> — {s.use}</li>)}</ul>
        <p>We never invent polls, results or candidates. When a race has no polls, the page says so and the forecast rests on fundamentals.</p>

        <h2 className="display">9. Data status</h2>
        <p>Every source is cached. If one is down during an update, the forecast uses its last good copy instead of failing, and this table says so.</p>
        {f.source_status?.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Source</th><th>Last update</th><th className="r">Fresh</th><th className="r">From cache</th><th className="r">Fallbacks</th></tr></thead>
            <tbody>{f.source_status.map((s) => (
              <tr key={s.source}><td>{s.source}</td><td>{s.state === "ok" ? "OK" : <span style={{ color: "var(--signal)" }}>Using a copy {s.oldest_stale_h} hours old</span>}</td>
                <td className="r num">{s.fresh}</td><td className="r num">{s.cached}</td><td className="r num">{s.stale}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <p className="muted">Not recorded for this update.</p>}

        <h2 className="display">10. What’s next</h2>
        <p>Coming in later phases: geographic district outlines for the 2026 lines (the Census hasn’t published them yet, so House maps use equal-size hexagons, one per district), live election-night results with a rehearsal mode, and 2028 and state-level coverage.</p>
      </section>
    </div>
  );
}
