import type { Metadata } from "next";
import { Suspense } from "react";
import ZipFinder, { type Lite, ZipBox } from "@/components/ZipFinder";
import { getForecast, getRaces } from "@/lib/data";

export const metadata: Metadata = { title: "Find my races", description: "Enter your ZIP code to see the Senate, House and governor races on your 2026 ballot, with forecasts." };

export default function Find() {
  const v = getForecast().default_version;
  const races: Lite[] = getRaces().map((r) => ({ id: r.id, office: r.office, state: r.state, state_name: r.state_name, district: r.district, title: r.title, kind: r.kind, dn: r.dside.name, rn: r.rside.name, p: r.p[v], b: r.rating[v] }));
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="kicker">Your ballot</div>
        <h1>Find my races</h1>
        <p className="dek">Enter your ZIP code to see the federal and governor races where you vote, with the forecast for each. Follow any race to keep it on your home page.</p>
        <div style={{ marginTop: 16 }}><ZipBox /></div>
      </header>
      <section className="block">
        <Suspense fallback={<div className="skeleton" style={{ height: 160 }} />}><ZipFinder races={races} /></Suspense>
      </section>
    </div>
  );
}
