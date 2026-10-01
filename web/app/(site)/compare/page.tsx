import type { Metadata } from "next";
import { Suspense } from "react";
import Compare from "@/components/Compare";
import { getForecast, getRaces } from "@/lib/data";

export const metadata: Metadata = { title: "Compare two races", description: "Put any two 2026 races side by side: odds, polling average, partisan lean, fundraising and how each race's odds have moved." };

export default function Page() {
  const races = getRaces().map((r) => ({ id: r.id, title: r.title, office: r.office, state: r.state_name, closeness: Math.abs(r.p[getForecast().default_version] - 0.5) }));
  const starts = races.filter((r) => r.office !== "house").sort((a, b) => a.closeness - b.closeness).slice(0, 6);
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="kicker">Tool</div>
        <h1>Compare two races</h1>
        <p className="dek">Pick any two races to see them side by side. The link in your address bar keeps your choices, so you can share it.</p>
      </header>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <Compare races={races} starts={starts.map((s) => s.id)} version={getForecast().default_version} />
      </Suspense>
    </div>
  );
}
