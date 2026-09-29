"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BUCKET_LABEL, bucketVar, in100, onBucket, surname } from "@/lib/format";
import type { Bucket } from "@/lib/types";
import FollowButton from "./FollowButton";

export type Lite = { id: string; office: "senate" | "house" | "governor"; state: string; state_name: string; district: number | null; title: string; kind: string; dn: string | null; rn: string | null; p: number; b: Bucket };
type Hit = [string, number | null, number];

const REDRAWN_NOTE = "This state drew new congressional districts for 2026, and ZIP codes can’t be matched to the new lines yet. Here are all of its House races; your state election office’s voter lookup will tell you which is yours.";

export function ZipBox({ compact = false }: { compact?: boolean }) {
  const [z, setZ] = useState("");
  const router = useRouter();
  return (
    <form className="zipbox" onSubmit={(e) => { e.preventDefault(); if (/^\d{5}$/.test(z)) router.push(`/find/?zip=${z}`); }} role="search" aria-label="Find your races by ZIP code">
      <label htmlFor={compact ? "zip-c" : "zip"} className={compact ? "sr-only" : "kicker"}>Your ZIP code</label>
      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <input id={compact ? "zip-c" : "zip"} inputMode="numeric" pattern="\d{5}" maxLength={5} placeholder="e.g. 19104" value={z}
          onChange={(e) => setZ(e.target.value.replace(/\D/g, "").slice(0, 5))} className="field" style={{ minWidth: 0, width: 140, margin: 0 }} />
        <button className="btn btn-primary" type="submit" disabled={z.length !== 5}>Find my races</button>
      </div>
    </form>
  );
}

export default function ZipFinder({ races }: { races: Lite[] }) {
  const sp = useSearchParams();
  const zip = sp.get("zip") ?? "";
  const [hits, setHits] = useState<Hit[] | null | "none" | "error">(null);
  useEffect(() => {
    if (!/^\d{5}$/.test(zip)) { setHits(null); return; }
    setHits(null);
    fetch(`/data/zip/${zip.slice(0, 2)}.json`).then((r) => (r.ok ? r.json() : {})).then((d: Record<string, Hit[]>) => setHits(d[zip] ?? "none")).catch(() => setHits("error"));
  }, [zip]);
  if (!zip) return <p className="muted">Enter a five-digit ZIP code to see the Senate, House and governor races on your ballot.</p>;
  if (hits === null) return <div className="skeleton" style={{ height: 160 }} aria-label="Looking up your races" />;
  if (hits === "error") return <p role="alert">Couldn’t load the ZIP code data. Check your connection and try again.</p>;
  if (hits === "none") return <p>We couldn’t find ZIP code <strong>{zip}</strong>. Some ZIP codes (P.O. boxes, single buildings) aren’t mapped to an area; try a nearby residential ZIP.</p>;
  const states = [...new Set(hits.map((h) => h[0]))];
  const card = (r: Lite, note?: string) => (
    <div key={r.id} className="bio-card" style={{ gap: 6 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="kicker">{r.office === "senate" ? "U.S. Senate" : r.office === "house" ? "U.S. House" : "Governor"}</span>
        <span className="chip" style={{ background: bucketVar(r.b), color: onBucket(r.b) }}>{BUCKET_LABEL[r.b]}</span>
      </div>
      <Link href={`/race/${r.id}/`} style={{ fontWeight: 600, fontSize: 18 }}>{r.title}</Link>
      {r.kind === "two_party" ? <div className="small">{surname(r.dn)} <strong className="num">{in100(r.p)}</strong> in 100 · {surname(r.rn)} <strong className="num">{in100(1 - r.p)}</strong></div>
        : <div className="small muted">{r.kind === "uncontested" ? "Only one candidate on the ballot." : "Both finalists are from the same party."}</div>}
      {note && <div className="small muted">{note}</div>}
      <div><FollowButton id={r.id} p={r.p} title={r.title} /></div>
    </div>
  );
  return (
    <div>
      {states.map((st) => {
        const inState = races.filter((r) => r.state === st);
        const statewide = inState.filter((r) => r.office !== "house");
        const dists = hits.filter((h) => h[0] === st);
        const redrawn = dists.some((h) => h[1] == null);
        const house = redrawn ? inState.filter((r) => r.office === "house") : dists.map((h) => inState.find((r) => r.office === "house" && r.district === h[1])).filter(Boolean) as Lite[];
        return (
          <div key={st} style={{ marginBottom: 32 }}>
            <h2 className="display">{inState[0]?.state_name ?? st}</h2>
            {statewide.length ? <div className="bio-grid" style={{ marginTop: 12 }}>{statewide.map((r) => card(r))}</div> : <p className="small muted">No Senate or governor race here this year.</p>}
            <h3 style={{ marginTop: 20 }}>{redrawn ? "House races in the state" : dists.length > 1 ? "Your House district (your ZIP spans more than one)" : "Your House district"}</h3>
            {redrawn && <p className="small">{REDRAWN_NOTE}</p>}
            {!house.length && <p className="small muted">No House race found for this ZIP code’s district.</p>}
            <div className="bio-grid" style={{ marginTop: 12 }}>
              {house.map((r) => card(r, !redrawn && dists.length > 1 ? `About ${Math.round((dists.find((h) => h[1] === r.district)?.[2] ?? 0) * 100)}% of the ZIP’s land area` : undefined))}
            </div>
          </div>
        );
      })}
      <p className="small muted">ZIP codes are matched using Census ZIP Code Tabulation Areas and 2020-census district relationships. ZIP codes that cross district lines are shown with every district they touch.</p>
    </div>
  );
}
