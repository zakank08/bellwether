import type { Metadata } from "next";
import Link from "next/link";
import { getForecast, getRaces } from "@/lib/data";
import { fmtUpdated } from "@/lib/format";

export const metadata: Metadata = { title: "Open data", description: "Download Bellwether’s race-by-race and chamber odds as CSV or JSON." };

const FILES = [
  ["/downloads/races.csv", "races.csv", "One row per race: odds for each side, rating, projected margin, polling average, who holds the seat now and whether it is likely to flip."],
  ["/downloads/chambers.csv", "chambers.csv", "Chance each party controls the Senate and House, for all three model versions."],
  ["/data/forecast.json", "forecast.json", "Everything on the home page: national mood, chamber odds and seat distributions, markets, sources."],
  ["/data/races.json", "races.json", "Every race in one file, with all three model versions."],
  ["/data/history.json", "history.json", "Odds over time for both chambers and every race (before Sept. 28, 2026 a backcast; see the methodology)."],
  ["/data/generic.json", "generic.json", "Generic-ballot average, trend and the polls in it."],
  ["/data/approval.json", "approval.json", "Presidential approval average, trend and the polls in it."],
  ["/data/pollsters.json", "pollsters.json", "Pollster ratings used to weight polls."],
] as const;

export default function OpenData() {
  const f = getForecast();
  const n = getRaces().length;
  return (
    <div className="wrap">
      <section className="block" style={{ paddingTop: 32 }}>
        <h1 className="display">Open data</h1>
        <p className="takeaway">
          The numbers behind this site, free to download. The files refresh each time the forecast does (several times a day); this copy is from {fmtUpdated(f.updated)}. Each race also has its own file at <code>/data/race/&lt;race id&gt;.json</code> with polls, candidates, fundraising and odds over time.
        </p>
        <div className="table-wrap">
          <table className="data cards">
            <thead><tr><th>File</th><th>What’s in it</th></tr></thead>
            <tbody>{FILES.map(([href, name, what]) => (
              <tr key={href}><td data-label="File"><a href={href} download>{name}</a></td><td data-label="What’s in it">{what}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="block">
        <h2 className="display">Reading the columns</h2>
        <ul className="plain">
          <li><strong>chance_*_out_of_100</strong>: the share of the model’s {f.n_sims.toLocaleString()} simulations that side won. It is the same “X in 100” shown on the site, not a poll result and not a certainty.</li>
          <li><strong>dem_side / rep_side</strong>: the Democratic-side and Republican-side finalists. When an independent or a second candidate of the same party is the main alternative, that candidate sits on the non-Republican (or non-Democratic) side and the party column says so.</li>
          <li><strong>projected_margin_dem_minus_rep</strong>: points; positive means the Democratic side leads. <strong>polling_avg_margin_…</strong> is the adjusted poll average before blending with the other inputs.</li>
          <li><strong>flip</strong>: <code>likely</code> (50 in 100 or better that the seat changes parties), <code>could</code> (25–49), or <code>no</code>. In the ten states with new House maps, the “current holder” is the sitting member’s party on the old lines.</li>
          <li><strong>forecast_version</strong>: {f.versions.map((x) => x.id).join(", ")}. The default shown on the site is <code>{f.default_version}</code>. {n} races are in the file.</li>
        </ul>
      </section>
      <section className="block">
        <h2 className="display">Using it</h2>
        <p>Please credit <strong>Bellwether</strong> and link to <a href="/">this site</a> when you use these numbers, and say which date they are from. The forecast figures are ours; the polls inside the polling files belong to their pollsters and come through <a href="https://votehub.com/polls/api/" rel="noopener noreferrer">VoteHub</a> and the pollsters’ own releases, and the candidate lists come from Wikipedia (CC BY-SA 4.0). See the <Link href="/methodology/">methodology</Link> for every source. Want to show a live card on your own site? Use the embed buttons on any race, or the chamber cards on the <Link href="/senate/">Senate</Link> and <Link href="/house/">House</Link> pages. A feed of the biggest changes is at <a href="/feed.xml">/feed.xml</a>.</p>
      </section>
    </div>
  );
}
