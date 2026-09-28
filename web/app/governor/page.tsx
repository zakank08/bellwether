import type { Metadata } from "next";
import ChamberPage from "@/components/ChamberPage";
import { compactRows, getForecast, getRaces } from "@/lib/data";

export const metadata: Metadata = { title: "Governor races" };

export default function Page() {
  return <ChamberPage office="governor" forecast={getForecast()} rows={compactRows(getRaces().filter((r) => r.office === "governor"))} />;
}
