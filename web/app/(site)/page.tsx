import { topNews } from "@/lib/news";
import Dashboard from "@/components/Dashboard";
import { chamberHistory, compactRows, getForecast, getRaces, getUpcoming, movers, sparks } from "@/lib/data";

export default function Home() {
  const races = getRaces();
  const ids = races.filter((r) => r.kind === "two_party" && (r.office !== "house" || (r.p.fundamentals > 0.03 && r.p.fundamentals < 0.97))).map((r) => r.id);
  return <Dashboard forecast={getForecast()} rows={compactRows(races)} history={chamberHistory()} sparks={sparks(ids)} movers={movers()} upcoming={getUpcoming()} news={topNews(4)} />;
}
