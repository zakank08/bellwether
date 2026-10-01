import { county2024, countyShapes } from "@/lib/counties";
import { FIPS } from "@/lib/tiles";
import CountyMap from "./CountyMap";

const BY_USPS = Object.fromEntries(Object.entries(FIPS).map(([f, s]) => [s, f]));

/** Server wrapper: draws the state's counties at build time and hands the client map only what it needs. */
export default function CountySection({ state, stateName, raceId, title = "County map" }: { state: string; stateName: string; raceId?: string; title?: string }) {
  const fips = BY_USPS[state];
  const geo = fips ? countyShapes(fips) : null;
  const c = county2024();
  if (!geo) {
    return (
      <section className="block">
        <h2 className="display">{title}</h2>
        <p className="muted">County detail isn’t shown for {stateName}: {state === "AK" ? "Alaska reports results by state House district, not by county." : state === "CT" ? "Connecticut reports results by town, and the county shapes no longer match." : "no county shapes are available."}</p>
      </section>
    );
  }
  const base = Object.fromEntries(Object.entries(c.counties).filter(([k]) => k.startsWith(fips)));
  return (
    <section className="block">
      <h2 className="display">{title}</h2>
      <p className="takeaway">{raceId ? "Counties colored by the 2024 presidential vote; on election night this switches to the live count in this race." : `${stateName}’s counties, colored by the 2024 presidential vote.`}</p>
      <CountyMap shapes={geo.shapes} w={geo.w} h={geo.h} base={base} raceId={raceId} stateName={stateName} />
      <p className="small muted" style={{ marginTop: 8 }}>2024 results: {c.source}</p>
    </section>
  );
}
