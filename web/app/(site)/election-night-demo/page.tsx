import type { Metadata } from "next";
import ElectionNightDemo from "@/components/demo/ElectionNightDemo";
import { getRaces, getSchedule } from "@/lib/data";

export const metadata: Metadata = { title: "Election night rehearsal (demo)", robots: { index: false, follow: false } };

export default function Page() {
  const v = "fundamentals" as const;
  const compact = getRaces().map((r) => ({ id: r.id, state: r.state, title: r.title, margin: r.margin[v] ?? null, incumbent_party: r.incumbent_party, rules: r.rules, district: r.district }));
  const schedule = (getSchedule()?.states ?? []).map((s) => ({ state: s.state, first: s.first, last: s.last }));
  return (
    <div>
      <div className="demo-banner" role="note">
        <div className="wrap"><strong>REHEARSAL DEMO. SIMULATED RESULTS, NOT REAL.</strong> Nothing on this page is from the Nov. 3 election. It replays one outcome from the forecast’s own simulations to show how election night will look and behave.</div>
      </div>
      <ElectionNightDemo compact={compact} schedule={schedule} />
    </div>
  );
}
