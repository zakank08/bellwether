import type { Metadata } from "next";
import Link from "next/link";
import StatusAge from "@/components/StatusAge";
import { coverage } from "@/lib/coverage";
import { getApproval, getForecast, getGeneric, getRaces } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Data status", description: "When the forecast last refreshed, which data sources are current, and where polling is thin." };

const LABEL: Record<string, string> = { "api.census.gov": "Census demographics" };

export default function Status() {
  const f = getForecast();
  const g = getGeneric();
  const a = getApproval();
  const races = getRaces();
  const v = f.default_version;
  const contested = races.filter((r) => r.kind === "two_party");
  const thinByOffice = (["senate", "governor", "house"] as const).map((o) => {
    const rs = contested.filter((r) => r.office === o);
    return { o, total: rs.length, none: rs.filter((r) => r.n_polls === 0).length, few: rs.filter((r) => r.n_polls > 0 && r.n_polls < 3).length };
  });
  const asofG = g.trend[g.trend.length - 1]?.date ?? f.asof;
  const asofA = a.trend[a.trend.length - 1]?.date ?? f.asof;
  const cg = coverage(g.polls, asofG), ca = coverage(a.polls, asofA);
  const sources = (f.source_status ?? []).slice().sort((x, y) => y.stale - x.stale || x.source.localeCompare(y.source));
  return (
    <div className="wrap">
      <section className="block" style={{ paddingTop: 32 }}>
        <h1 className="display">Data status</h1>
        <p className="takeaway">A plain look at how current the numbers on this site are. If something here looks wrong, the forecast above it may be too.</p>
        <StatusAge updated={f.updated} />
        <p className="small muted" style={{ marginTop: 8 }}>Forecast date {fmtDate(f.asof)} · {f.days_to_election} days to the election · model {f.model_version} · {f.n_sims.toLocaleString()} simulations · default view: {f.versions.find((x) => x.id === v)?.label}.</p>
      </section>

      <section className="block">
        <h2 className="display">National polls</h2>
        <div className="table-wrap">
          <table className="data cards">
            <thead><tr><th>Average</th><th className="r">Polls in last 30 days</th><th className="r">Latest poll ended</th><th>Note</th></tr></thead>
            <tbody>
              <tr><td data-label="Average">Generic ballot</td><td data-label="Polls in last 30 days" className="r num">{cg.recent}</td><td data-label="Latest poll ended" className="r num">{cg.latest ? fmtDate(cg.latest) : "—"}</td><td data-label="Note">{cg.thin ? "Few recent polls; may be out of date." : "Healthy."}{cg.fromReleases ? ` ${cg.fromReleases} entered from pollsters’ releases.` : ""}</td></tr>
              <tr><td data-label="Average">Presidential approval</td><td data-label="Polls in last 30 days" className="r num">{ca.recent}</td><td data-label="Latest poll ended" className="r num">{ca.latest ? fmtDate(ca.latest) : "—"}</td><td data-label="Note">{ca.thin ? "Few recent polls; may be out of date." : "Healthy."}{ca.fromReleases ? ` ${ca.fromReleases} entered from pollsters’ releases.` : ""}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Our main poll feed stopped carrying most national polls after June, so those are added from each pollster’s own release. <Link href="/methodology/">Details</Link>.</p>
      </section>

      <section className="block">
        <h2 className="display">Where polling is thin</h2>
        <div className="table-wrap">
          <table className="data cards">
            <thead><tr><th>Races</th><th className="r">Contested</th><th className="r">No polls</th><th className="r">One or two polls</th></tr></thead>
            <tbody>{thinByOffice.map((t) => (
              <tr key={t.o}><td data-label="Races">{({ senate: "Senate", governor: "Governor", house: "House" })[t.o]}</td><td data-label="Contested" className="r num">{t.total}</td><td data-label="No polls" className="r num">{t.none}</td><td data-label="One or two polls" className="r num">{t.few}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Races with no polls rest on partisan lean, the national environment, incumbency and fundraising. Their odds carry more uncertainty than the number suggests.</p>
      </section>

      <section className="block">
        <h2 className="display">Data sources in the latest refresh</h2>
        <div className="table-wrap">
          <table className="data cards">
            <thead><tr><th>Source</th><th className="r">Fresh</th><th className="r">Reused from cache</th><th className="r">Source down (older copy used)</th></tr></thead>
            <tbody>{sources.map((s) => (
              <tr key={s.source}><td data-label="Source">{LABEL[s.source] ?? s.source}</td><td data-label="Fresh" className="r num">{s.fresh}</td><td data-label="Reused from cache" className="r num">{s.cached}</td>
                <td data-label="Source down (older copy used)" className="r num">{s.stale ? `${s.stale}${s.oldest_stale_h != null ? ` (up to ${Math.round(s.oldest_stale_h)} h old)` : ""}` : "0"}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>“Reused from cache” means the source was asked recently, so we didn’t ask again. If a source is down, the last good copy is used and counted in the last column.</p>
      </section>
    </div>
  );
}
