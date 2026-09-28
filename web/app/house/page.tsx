import type { Metadata } from "next";
import ChamberPage from "@/components/ChamberPage";
import { compactRows, getForecast, getRaces } from "@/lib/data";

export const metadata: Metadata = { title: "House races" };

export default function Page() {
  return <ChamberPage office="house" forecast={getForecast()} rows={compactRows(getRaces().filter((r) => r.office === "house"))} />;
}
