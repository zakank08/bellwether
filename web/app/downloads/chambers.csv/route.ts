import { csvResponse, csvRow } from "@/lib/csv";
import { getForecast } from "@/lib/data";

export const dynamic = "force-static";

// Chance each party controls each chamber, for all three model versions.
export function GET() {
  const f = getForecast();
  const lines = [csvRow(["forecast_version", "chamber", "chance_dem_control_out_of_100", "chance_rep_control_out_of_100", "chance_no_majority_out_of_100",
    "typical_dem_seats", "dem_seats_80_in_100_low", "dem_seats_80_in_100_high", "forecast_date", "updated_utc"])];
  for (const ver of f.versions) {
    for (const ch of ["senate", "house"] as const) {
      const c = f.chambers[ver.id][ch];
      lines.push(csvRow([ver.id, ch, +(c.p_control.D * 100).toFixed(1), +(c.p_control.R * 100).toFixed(1), +(c.p_control.contingent * 100).toFixed(1),
        c.median_seats.D, c.p80[0], c.p80[1], f.asof, f.updated]));
    }
  }
  return csvResponse(lines, "bellwether-chambers.csv");
}
