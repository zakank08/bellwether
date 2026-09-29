import type { Metadata } from "next";
import Link from "next/link";
import Countdown from "@/components/Countdown";
import Reveal from "@/components/Reveal";
import { getForecast, getRaces, getSchedule } from "@/lib/data";
import { BUCKET_LABEL, bucketVar, fmtDate, in100, onBucket } from "@/lib/format";

export const metadata: Metadata = { title: "Election night schedule", description: "When polls close in each state on Nov. 3, 2026, and which races to watch at each hour." };

const hhmm = (min: number) => {
  const h24 = 12 + Math.floor(min / 60), mm = min % 60;
  const h = ((h24 - 1) % 12) + 1, ap = h24 % 24 < 12 ? "AM" : "PM";
  return `${h}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${ap}`;
};
const OFFICE = { senate: "Senate", governor: "Gov.", house: "House" } as const;

export default function Schedule() {
  const sch = getSchedule();
  const f = getForecast();
  const v = f.default_version;
  const races = Object.fromEntries(getRaces().map((r) => [r.id, r]));
  if (!sch) return <div className="wrap"><p style={{ padding: 48 }}>The schedule hasn’t been generated yet.</p></div>;
  const listed = sch.states.filter((s) => s.first != null);
  const unlisted = sch.states.filter((s) => s.first == null);
  const groups = new Map<number, typeof listed>();
  for (const s of listed) (groups.get(s.first!) ?? groups.set(s.first!, []).get(s.first!)!).push(s);
  const watch = (id: string) => { const r = races[id]; return r && r.kind === "two_party" && Math.abs(r.p[v] - 0.5) < 0.3; };
  const chips = (ids: string[]) => ids.map((id) => races[id]).filter((r) => r && r.kind === "two_party")
    .sort((a, b) => ["senate", "governor", "house"].indexOf(a.office) - ["senate", "governor", "house"].indexOf(b.office) || Math.abs(a.p[v] - 0.5) - Math.abs(b.p[v] - 0.5))
    .filter((r) => r.office !== "house" || watch(r.id));
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="kicker">Election night · Tuesday, Nov. 3, 2026</div>
        <h1>When polls close</h1>
        <p className="dek">The order results start coming in, and which races to watch at each hour. All times Eastern.</p>
        <div style={{ marginTop: 20 }}>
          <div className="kicker" style={{ marginBottom: 6 }}>First polls close in</div>
          <Countdown to="2026-11-03T23:00:00Z" label="Time until the first polls close" after="Polls are closing now." />
        </div>
      </header>

      <section className="block">
        <h2 className="display big">Hour by hour</h2>
        <p className="takeaway">States are placed at their <em>first</em> closing time; where part of a state closes later, that’s noted. Colored chips are races on the ballot there; House races shown are the competitive ones. <strong>Watch</strong> marks races the model sees as within reach for both sides.</p>
        <ol className="timeline">
          {[...groups.entries()].map(([min, states], gi) => (
            <li key={min}>
              <Reveal delay={Math.min(gi * 0.04, 0.2)}>
                <div className="tl-time display">{hhmm(min)}</div>
                <div className="tl-body">
                  {states.map((s) => (
                    <div key={s.state} className="tl-state">
                      <div className="tl-state-name"><strong>{s.state_name}</strong>{s.times.length > 1 && <span className="small muted"> · rest of state {s.times.slice(1).join(", ")}</span>}</div>
                      <div className="tl-chips">
                        {chips(s.races).map((r) => (
                          <Link key={r.id} href={`/race/${r.id}/`} className="tl-chip" style={{ background: bucketVar(r.rating[v]), color: onBucket(r.rating[v]) }}
                            title={`${r.title} ${OFFICE[r.office]}: ${r.dside.name} ${in100(r.p[v])} in 100`}>
                            {OFFICE[r.office]}{r.office === "house" ? ` ${r.district}` : ""} · {BUCKET_LABEL[r.rating[v]]}{watch(r.id) && <span className="tl-watch">Watch</span>}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {unlisted.length > 0 && (
        <section className="block">
          <h2 className="display">Other states</h2>
          <p className="takeaway small">These states have House or governor races but no Senate race this year, and our source only lists closing times for Senate states. We’ll add their times from state election offices before election night rather than guess.</p>
          <div className="row" style={{ gap: 8 }}>
            {unlisted.map((s) => {
              const n = chips(s.races).length;
              return <span key={s.state} className="pill-note">{s.state_name}{n ? ` · ${n} to watch` : ""}</span>;
            })}
          </div>
        </section>
      )}

      <section className="block">
        <h2 className="display">Key dates</h2>
        <ul className="dates">
          {sch.key_dates.map((d) => (
            <li key={d.date}><span className="display num">{fmtDate(d.date, { month: "short", day: "numeric" })}</span><div><strong>{d.label}</strong><br /><span className="small muted">{d.note}</span></div></li>
          ))}
        </ul>
        <p className="small muted">Closing times: {sch.source}. Live results on this page are coming before election night.</p>
      </section>
    </div>
  );
}
