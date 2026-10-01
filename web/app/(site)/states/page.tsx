import type { Metadata } from "next";
import Link from "next/link";
import { getForecast, getRaces } from "@/lib/data";
import { flipOf } from "@/lib/flips";

export const metadata: Metadata = { title: "All states", description: "Pick a state to see every 2026 race on its ballot: Senate, governor and U.S. House." };

export default function Page() {
  const v = getForecast().default_version, races = getRaces();
  const states = [...new Map(races.map((r) => [r.state, r.state_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="kicker">Browse</div>
        <h1>All states</h1>
        <p className="dek">Every race on the Nov. 3 ballot, state by state. A yellow tag means at least one race there is likely to change parties.</p>
      </header>
      <ul className="state-grid">
        {states.map(([st, nm]) => {
          const rs = races.filter((r) => r.state === st);
          const fl = rs.filter((r) => flipOf(r, v)?.tier === "likely").length;
          return (
            <li key={st}><Link href={`/state/${st.toLowerCase()}/`}>
              <strong>{nm}</strong>
              <span className="small muted">{rs.length} race{rs.length === 1 ? "" : "s"}</span>
              {fl > 0 && <span className="flip-chip">{fl} likely to flip</span>}
            </Link></li>
          );
        })}
      </ul>
    </div>
  );
}
