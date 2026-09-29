"use client";
import { useMemo, useState } from "react";
import type { CompactRow } from "@/lib/data";
import type { Forecast } from "@/lib/types";
import { mapItems } from "./Dashboard";
import HouseWaffle from "./HouseWaffle";
import HouseHexMap from "./HouseHexMap";
import RaceList from "./RaceList";
import { Legend } from "./MapBits";
import StateMap from "./MapLazy";
import { TipProvider } from "./Tooltip";
import { useVersion, VersionProvider, VersionToggle } from "./VersionContext";

export default function ChamberPage(props: { office: "senate" | "house" | "governor"; forecast: Forecast; rows: CompactRow[] }) {
  return (
    <VersionProvider initial={props.forecast.default_version}>
      <TipProvider><Inner {...props} /></TipProvider>
    </VersionProvider>
  );
}

const TITLE = { senate: "Senate", house: "House", governor: "Governor" };

function Inner({ office, rows }: { office: "senate" | "house" | "governor"; forecast: Forecast; rows: CompactRow[] }) {
  const { v } = useVersion();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "competitive">(office === "house" ? "competitive" : "all");
  const [houseView, setHouseView] = useState<"map" | "grid">("map");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => filter === "all" || (r.kind === "two_party" && r.p[v] > 0.05 && r.p[v] < 0.95))
      .filter((r) => !s || `${r.title} ${r.dside.name} ${r.rside.name} ${r.state}`.toLowerCase().includes(s))
      .sort((a, b) => Math.abs(a.p[v] - 0.5) - Math.abs(b.p[v] - 0.5));
  }, [rows, q, filter, v]);
  return (
    <div className="wrap">
      <section className="block" style={{ paddingTop: 32 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="display">{TITLE[office]} races</h1>
          <VersionToggle />
        </div>
        <p className="takeaway">{rows.length} races, closest first. Odds are the share of simulations each side wins.</p>
        {office === "house" ? (
          <>
            <div className="toggle" role="group" aria-label="House view" style={{ marginBottom: 12 }}>
              <button aria-pressed={houseView === "map"} onClick={() => setHouseView("map")}>District map</button>
              <button aria-pressed={houseView === "grid"} onClick={() => setHouseView("grid")}>Seat grid</button>
            </div>
            {houseView === "map" ? <HouseHexMap rows={rows} v={v} /> : <HouseWaffle rows={rows} v={v} />}
          </>
        ) : <StateMap items={mapItems(rows, v)} title={`${TITLE[office]} map`} />}
        <div style={{ marginTop: 12 }}><Legend showInd /></div>
      </section>
      <section className="block">
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="sr-only" htmlFor="flt">Filter races</label>
          <input id="flt" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by state or candidate"
            style={{ font: "inherit", fontSize: 14, height: 40, padding: "0 12px", border: "1px solid var(--line)", borderRadius: 999, background: "var(--surface-raised)", color: "var(--ink)", minWidth: 240 }} />
          <div className="toggle" role="group" aria-label="Which races">
            <button aria-pressed={filter === "competitive"} onClick={() => setFilter("competitive")}>Competitive</button>
            <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
          </div>
          <span className="small muted">{shown.length} shown</span>
        </div>
        <RaceList rows={shown} v={v} caption={`${TITLE[office]} races`} />
      </section>
    </div>
  );
}
