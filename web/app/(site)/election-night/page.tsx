import type { Metadata } from "next";
import LiveNight from "@/components/demo/LiveNight";
import { getRaces, getSchedule } from "@/lib/data";

export const metadata: Metadata = {
  title: "Election night live results",
  description: "Live results for the 2026 midterms: Senate, House and governors’ races: balance of power, a map you can zoom into by county or district, and every race as the votes come in, straight from state result sites.",
};

export default function Page() {
  const v = "fundamentals" as const;
  const compact = getRaces().map((r) => ({ id: r.id, state: r.state, title: r.title, margin: r.margin[v] ?? null, incumbent_party: r.incumbent_party, rules: r.rules, district: r.district }));
  const govs = getRaces().filter((r) => r.office === "governor" && r.kind === "two_party").map((r) => ({ id: r.id, state: r.state, title: r.title, margin: r.margin[v] ?? null, p: r.p[v], incumbent_party: r.incumbent_party, rules: r.rules, dn: r.dside.name, dp: r.dside.party, rn: r.rside.name, rp: r.rside.party }));
  const stateNames = Object.fromEntries(getRaces().map((r) => [r.state, r.state_name]));
  const schedule = (getSchedule()?.states ?? []).map((s) => ({ state: s.state, first: s.first, last: s.last }));
  return (
    <div>
      <header className="wrap masthead" style={{ paddingBottom: 0 }}>
        <div className="kicker">Nov. 3, 2026</div>
        <h1>Election night</h1>
        <p className="dek">Live results for the Senate, House and governors’ races as states report them. Numbers come from official state result sites. Winners marked “Projected” are Bellwether’s own projections, made by a cautious rule we publish; they are not calls by AP or anyone else. Odds are the share of simulations each side wins.</p>
      </header>
      <LiveNight compact={compact} schedule={schedule} govs={govs} stateNames={stateNames} />
    </div>
  );
}
