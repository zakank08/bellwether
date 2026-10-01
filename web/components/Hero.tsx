"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { CompactRow } from "@/lib/data";
import { BUCKET_LABEL, in100 } from "@/lib/format";
import { flipLong, flipOf, flipShort, isRedrawnHouse, tally, type FlipTally } from "@/lib/flips";
import type { Forecast, Version } from "@/lib/types";
import CountUp from "./CountUp";
import { tipLinesFor } from "./MapBits";
import SeatArc, { type Seat } from "./SeatArc";

// Chance the seat ends up Democratic (independents and same-party Republican finals count as not Democratic).
const dShare = (r: CompactRow, v: Version) => (r.dside.party === "D" ? r.p[v] : 0) + (r.rside.party === "D" ? 1 - r.p[v] : 0);

function seatsFor(rows: CompactRow[], v: Version, notUp?: { D: number; R: number; I_caucus_D: number }): Seat[] {
  const up = [...rows].sort((a, b) => dShare(b, v) - dShare(a, v)).map<Seat>((r) => ({
    key: r.id, id: r.id, bucket: r.rating[v], flip: flipOf(r, v)?.tier,
    tip: <><strong>{r.title}</strong> · {BUCKET_LABEL[r.rating[v]]}<br />{tipLinesFor(r.dside.name, r.dside.party, r.rside.name, r.rside.party, r.p[v])}
      {flipOf(r, v) && <><br /><span className="flip-chip">{flipShort(flipOf(r, v)!)}</span><br /><span className="small">{flipLong(flipOf(r, v)!, in100, isRedrawnHouse(r))}</span></>}</>,
  }));
  if (!notUp) return up;
  const nd = notUp.D + notUp.I_caucus_D;
  const left = Array.from({ length: nd }, (_, i) => ({ key: `nd${i}`, bucket: "notup-d" as const, tip: <>Democratic or allied independent seat <strong>not up</strong> until 2028 or 2030</> }));
  const right = Array.from({ length: notUp.R }, (_, i) => ({ key: `nr${i}`, bucket: "notup-r" as const, tip: <>Republican seat <strong>not up</strong> until 2028 or 2030</> }));
  return [...left, ...up, ...right];
}

function Panel({ chamber, p, seats, majority, href, median, range, flips }: {
  chamber: "Senate" | "House"; p: { D: number; R: number; contingent: number }; seats: Seat[]; majority: number; href: string; median: number; range: [number, number]; flips: FlipTally;
}) {
  const lead = p.D >= p.R ? "D" : "R";
  const leadN = Math.round((lead === "D" ? p.D : p.R) * 100);
  const other = Math.round((lead === "D" ? p.R : p.D) * 100);
  const c = 100 - leadN - other;
  return (
    <div className="hero-panel">
      <div className="kicker">{chamber}</div>
      <div className="hero-odds" style={{ color: lead === "D" ? "var(--dem)" : "var(--rep)" }}>
        <span className="display"><CountUp value={leadN} /></span><span className="display hero-in"> in 100</span>
      </div>
      <p className="hero-sentence display">
        {lead === "D" ? "Democrats" : "Republicans"} win the {chamber} in <span className="num">{leadN}</span> of 100 simulations.
        <span className="muted"> {lead === "D" ? "Republicans" : "Democrats"} win <span className="num">{other}</span>{c > 0 ? <>; <span className="num">{c}</span> end with no majority</> : null}.</span>
      </p>
      <SeatArc seats={seats} majority={majority} label={`${chamber} seats from most likely Democratic to most likely Republican`} />
      <p className="small flip-line">
        <span className="flip-chip">{flips.likely} likely to flip</span>{" "}
        <span className="muted">{flips.likelyToD > 0 && <>to D <span className="num">{flips.likelyToD}</span></>}{flips.likelyToD > 0 && flips.likelyToR > 0 && " · "}{flips.likelyToR > 0 && <>to R <span className="num">{flips.likelyToR}</span></>}{flips.likelyToOther > 0 && <> · other <span className="num">{flips.likelyToOther}</span></>}{flips.likely === 0 && "none at 50 in 100 or better"}
          {flips.could > 0 && <> · <span className="num">{flips.could}</span> more could</>}</span>
      </p>
      <div className="row small muted" style={{ justifyContent: "space-between", marginTop: 4 }}>
        <span>Typical result: <strong className="num" style={{ color: "var(--dem)" }}>{Math.round(median)} D</strong> (80 in 100: {range[0]}–{range[1]})</span>
        <Link href={href}>All {chamber} races →</Link>
      </div>
    </div>
  );
}

export default function Hero({ f, v, rows }: { f: Forecast; v: Version; rows: CompactRow[] }) {
  const ch = f.chambers[v];
  const senate = useMemo(() => seatsFor(rows.filter((r) => r.office === "senate"), v, ch.senate.not_up), [rows, v, ch]);
  const house = useMemo(() => seatsFor(rows.filter((r) => r.office === "house"), v), [rows, v]);
  return (
    <div className="hero-grid">
      <Panel chamber="Senate" p={ch.senate.p_control} seats={senate} majority={51} href="/senate/" median={ch.senate.median_seats.D} range={ch.senate.p80} flips={tally(rows.filter((r) => r.office === "senate"), v)} />
      <Panel chamber="House" p={ch.house.p_control} seats={house} majority={218} href="/house/" median={ch.house.median_seats.D} range={ch.house.p80} flips={tally(rows.filter((r) => r.office === "house"), v)} />
      <p className="small muted hero-note">
        Each dot is a seat, colored by how likely each side is to win it; lighter end dots in the Senate aren’t up this year. A yellow ring marks a seat likely to change parties. Select a dot to open its race. Odds: <span className="num">{in100(ch.senate.p_control.D)}</span> and <span className="num">{in100(ch.house.p_control.D)}</span> in 100 for Democrats.
      </p>
    </div>
  );
}
