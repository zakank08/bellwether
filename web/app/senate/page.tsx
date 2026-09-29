import type { Metadata } from "next";
import ChamberPage from "@/components/ChamberPage";
import { compactRows, getForecast, getRaces, sparks } from "@/lib/data";

export const metadata: Metadata = { title: "Senate races" };

export default function Page() {
  const rows = getRaces().filter((r) => r.office === "senate");
  const ids = rows.filter((r) => r.kind === "two_party" && (r.office !== "house" || (r.p.fundamentals > 0.03 && r.p.fundamentals < 0.97))).map((r) => r.id);
  return <ChamberPage office="senate" forecast={getForecast()} rows={compactRows(rows)} sparks={sparks(ids)} />;
}
