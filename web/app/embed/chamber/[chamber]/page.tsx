import type { Metadata } from "next";
import { getForecast, getRaces } from "@/lib/data";
import { tally } from "@/lib/flips";
import { fmtUpdated, in100 } from "@/lib/format";

export const metadata: Metadata = { robots: { index: false } };

export function generateStaticParams() {
  return [{ chamber: "senate" }, { chamber: "house" }];
}

/** A compact chamber-control card other sites can embed with an iframe. */
export default async function EmbedChamber({ params }: { params: Promise<{ chamber: string }> }) {
  const chamber = (await params).chamber === "house" ? "house" : "senate";
  const f = getForecast();
  const v = f.default_version;
  const c = f.chambers[v][chamber];
  const t = tally(getRaces().filter((r) => r.office === chamber), v);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bellwether-zak.vercel.app";
  const label = chamber === "senate" ? "U.S. Senate" : "U.S. House";
  const d = c.p_control.D, r = c.p_control.R, o = c.p_control.contingent;
  return (
    <div className="embed">
      <div className="kicker">{label} control · 2026</div>
      <div className="row" style={{ justifyContent: "space-between", fontSize: 15, margin: "8px 0 4px" }}>
        <span><strong>Democrats</strong> <span className="num" style={{ fontSize: 28, fontWeight: 700, color: "var(--dem)" }}>{in100(d)}</span> <span className="small muted">in 100</span></span>
        <span><span className="small muted">in 100</span> <span className="num" style={{ fontSize: 28, fontWeight: 700, color: "var(--rep)" }}>{in100(r)}</span> <strong>Republicans</strong></span>
      </div>
      <div className="bar" style={{ height: 10, margin: "4px 0 8px" }} aria-hidden="true">
        <div style={{ width: `${d * 100}%`, background: "var(--d-safe)" }} /><div style={{ width: `${o * 100}%`, background: "var(--tossup)" }} /><div style={{ flex: 1, background: "var(--r-safe)" }} />
      </div>
      <div className="small" style={{ marginBottom: 6 }}>
        <span className="flip-chip">{t.likely} seats likely to flip</span>{" "}
        <span className="muted">Typical result {Math.round(c.median_seats.D)} D seats (80 in 100: {c.p80[0]}–{c.p80[1]})</span>
      </div>
      <div className="small muted" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>Share of simulations each side wins · {fmtUpdated(f.updated)}</span>
        <a href={`${site}/${chamber}/`} target="_blank" rel="noopener">Forecast by Bellwether ↗</a>
      </div>
    </div>
  );
}
