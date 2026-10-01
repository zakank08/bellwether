import type { Metadata } from "next";
import Link from "next/link";
import RaceList from "@/components/RaceList";
import { compactRows, getForecast, getRaces, getSchedule, sparks } from "@/lib/data";
import { flipOf } from "@/lib/flips";
import { BUCKET_LABEL, bucketVar, in100, onBucket } from "@/lib/format";

export function generateStaticParams() {
  return [...new Set(getRaces().map((r) => r.state))].map((st) => ({ st: st.toLowerCase() }));
}
const name = (st: string) => getRaces().find((r) => r.state === st.toUpperCase())?.state_name ?? st.toUpperCase();

export async function generateMetadata({ params }: { params: Promise<{ st: string }> }): Promise<Metadata> {
  const { st } = await params;
  return { title: `${name(st)} elections 2026`, description: `Every race on the ballot in ${name(st)} on Nov. 3, 2026: Senate, governor and U.S. House, with odds, polls and when polls close.` };
}

export default async function Page({ params }: { params: Promise<{ st: string }> }) {
  const { st } = await params;
  const ST = st.toUpperCase(), f = getForecast(), v = f.default_version;
  const all = getRaces().filter((r) => r.state === ST);
  const top = all.filter((r) => r.office !== "house");
  const house = all.filter((r) => r.office === "house").sort((a, b) => (a.district ?? 0) - (b.district ?? 0));
  const sched = getSchedule()?.states.find((s) => s.state === ST);
  const flips = all.filter((r) => flipOf(r, v)?.tier === "likely");
  const ids = all.filter((r) => r.kind === "two_party" && (r.p[v] > 0.03 && r.p[v] < 0.97)).map((r) => r.id);
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="kicker"><Link href="/states/">All states</Link> · 2026 elections</div>
        <h1>{name(ST)}</h1>
        <p className="dek">
          {all.length} race{all.length === 1 ? "" : "s"} on the Nov. 3 ballot: {top.filter((r) => r.office === "senate").length ? "U.S. Senate, " : ""}{top.some((r) => r.office === "governor") ? "governor, " : ""}{house.length} U.S. House seat{house.length === 1 ? "" : "s"}.
          {sched?.close ? <> Polls close at {sched.close} Eastern.</> : null}
          {flips.length ? <> {flips.length} race{flips.length === 1 ? " is" : "s are"} likely to change parties.</> : null}
        </p>
      </header>
      {top.length > 0 && (
        <section className="block" style={{ paddingTop: 0 }}>
          <h2 className="display">Statewide</h2>
          <div className="race-card-grid">
            {top.map((r) => (
              <Link key={r.id} href={`/race/${r.id}/`} className="race-card">
                <div className="kicker">{r.office === "senate" ? "U.S. Senate" : "Governor"}{r.special ? " · special" : ""}</div>
                <div style={{ fontWeight: 600, margin: "4px 0 6px" }}>{r.dside.name ?? "—"} vs. {r.rside.name ?? "—"}</div>
                <span className="chip" style={{ background: bucketVar(r.rating[v]), color: onBucket(r.rating[v]) }}>{BUCKET_LABEL[r.rating[v]]}</span>
                {r.kind === "two_party" && <div className="small muted num" style={{ marginTop: 6 }}>{in100(r.p[v])} in 100 for {r.dside.name?.split(" ").pop()} · {in100(1 - r.p[v])} in 100 for {r.rside.name?.split(" ").pop()}</div>}
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="block">
        <h2 className="display">U.S. House</h2>
        <RaceList rows={compactRows(house)} v={v} caption={`${name(ST)} U.S. House races`} sparks={sparks(ids)} />
      </section>
      <p className="small muted">Also: <Link href="/find/">find the races on your ballot by ZIP code</Link> · <Link href="/schedule/">election-night schedule</Link>. Odds are the share of simulations each side wins.</p>
    </div>
  );
}
