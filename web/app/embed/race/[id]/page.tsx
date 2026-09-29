import type { Metadata } from "next";
import { getForecast, getRace, getRaces } from "@/lib/data";
import { BUCKET_LABEL, bucketVar, fmtUpdated, in100, onBucket, surname } from "@/lib/format";

export const metadata: Metadata = { robots: { index: false } };

export function generateStaticParams() {
  return getRaces().filter((r) => r.kind === "two_party").map((r) => ({ id: r.id }));
}

const OFFICE = { senate: "U.S. Senate", house: "U.S. House", governor: "Governor" } as const;
const ink = (p: string | null) => (p === "D" ? "var(--d-safe)" : p === "R" ? "var(--r-safe)" : "var(--ind-fill)");

/** A compact race card other sites can embed with an iframe. */
export default async function Embed({ params }: { params: Promise<{ id: string }> }) {
  const r = getRace((await params).id);
  const f = getForecast();
  const v = f.default_version;
  const p = r.p[v], b = r.rating[v];
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bellwether-zak.vercel.app";
  return (
    <div className="embed">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="kicker">{OFFICE[r.office]} · 2026</span>
        <span className="chip" style={{ background: bucketVar(b), color: onBucket(b) }}>{BUCKET_LABEL[b]}</span>
      </div>
      <div className="display" style={{ fontSize: 24, fontWeight: 600, margin: "6px 0 10px" }}>{r.title}</div>
      <div className="row" style={{ justifyContent: "space-between", fontSize: 15 }}>
        <span><strong>{surname(r.dside.name)}</strong> <span className="num" style={{ fontSize: 22, fontWeight: 700, color: ink(r.dside.party) }}>{in100(p)}</span></span>
        <span><span className="num" style={{ fontSize: 22, fontWeight: 700, color: ink(r.rside.party) }}>{in100(1 - p)}</span> <strong>{surname(r.rside.name)}</strong></span>
      </div>
      <div className="bar" style={{ height: 10, margin: "6px 0 8px" }}>
        <div style={{ width: `${p * 100}%`, background: ink(r.dside.party) }} /><div style={{ flex: 1, background: ink(r.rside.party) }} />
      </div>
      <div className="small muted" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>Chance of winning, out of 100 · {fmtUpdated(f.updated)}</span>
        <a href={`${site}/race/${r.id}/`} target="_blank" rel="noopener">Forecast by Bellwether ↗</a>
      </div>
    </div>
  );
}
