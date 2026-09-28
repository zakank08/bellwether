import Dashboard from "@/components/Dashboard";
import { compactRows, getForecast, getHistory, getRaces } from "@/lib/data";

export default function Home() {
  return <Dashboard forecast={getForecast()} rows={compactRows(getRaces())} history={getHistory()} />;
}
