import { csvResponse, csvRow } from "@/lib/csv";
import { getForecast, getRaces } from "@/lib/data";
import { flipOf } from "@/lib/flips";

export const dynamic = "force-static";

// One row per race. "chance_*" are the share of the model's simulations each side won, as a number out of 100.
export function GET() {
  const f = getForecast();
  const v = f.default_version;
  const head = ["race_id", "office", "state", "district", "title", "dem_side_candidate", "dem_side_party", "rep_side_candidate", "rep_side_party",
    "chance_dem_side_out_of_100", "chance_rep_side_out_of_100", "rating", "projected_margin_dem_minus_rep", "polling_avg_margin_dem_minus_rep", "polls",
    "current_holder_party", "flip", "flip_to_party", "chance_changes_hands_out_of_100", "forecast_version", "forecast_date", "updated_utc"];
  const lines = [csvRow(head)];
  for (const r of getRaces()) {
    const two = r.kind === "two_party";
    const fl = flipOf(r, v);
    lines.push(csvRow([r.id, r.office, r.state, r.district ?? "", r.title, r.dside.name, r.dside.party, r.rside.name, r.rside.party,
      two ? +(r.p[v] * 100).toFixed(1) : "", two ? +((1 - r.p[v]) * 100).toFixed(1) : "", r.rating[v], r.margin[v] ?? "", r.poll_avg ?? "", r.n_polls,
      r.incumbent_party ?? "", fl ? fl.tier : "no", fl ? fl.to : "", fl ? +(fl.p * 100).toFixed(1) : "", v, f.asof, f.updated]));
  }
  return csvResponse(lines, "bellwether-races.csv");
}
