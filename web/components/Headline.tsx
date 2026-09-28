"use client";
import Link from "next/link";
import { in100 } from "@/lib/format";
import CountUp from "./CountUp";

/** The first thing on the page: one sentence, one big number, both sides shown. */
export default function Headline({ chamber, p, href }: { chamber: "Senate" | "House"; p: { D: number; R: number; contingent: number }; href: string }) {
  const d = Math.round(p.D * 100), r = Math.round(p.R * 100), c = 100 - d - r;
  const lead = p.D >= p.R ? "D" : "R";
  const leadN = lead === "D" ? d : r;
  const otherN = lead === "D" ? r : d;
  return (
    <div>
      <div className="kicker">{chamber} control</div>
      <div className="display" style={{ fontSize: 64, lineHeight: "64px", margin: "8px 0 4px", color: lead === "D" ? "var(--dem)" : "var(--rep)" }}>
        <CountUp value={leadN} /><span style={{ fontSize: 28, color: "var(--ink-muted)", marginLeft: 8 }}>in 100</span>
      </div>
      <p className="display" style={{ fontSize: 24, lineHeight: "30px", fontWeight: 500, margin: 0, maxWidth: 480 }}>
        {lead === "D" ? "Democrats" : "Republicans"} win the {chamber} in <span className="num">{leadN}</span> of 100 simulations.{" "}
        {lead === "D" ? "Republicans" : "Democrats"} win in <span className="num">{otherN}</span>
        {c > 0 && <>; in <span className="num">{c}</span> no party reaches a majority on its own</>}.
      </p>
      <div className="bar" style={{ marginTop: 12, maxWidth: 480 }} aria-hidden="true">
        <div style={{ width: `${p.D * 100}%`, background: "var(--d-safe)", transition: "width .6s" }} />
        <div style={{ width: `${p.contingent * 100}%`, background: "var(--tossup)", transition: "width .6s" }} />
        <div style={{ width: `${p.R * 100}%`, background: "var(--r-safe)", transition: "width .6s" }} />
      </div>
      <Link href={href} className="small" style={{ display: "inline-block", marginTop: 8 }}>{chamber} races →</Link>
      <span className="sr-only">Democrats {in100(p.D)} in 100, Republicans {in100(p.R)} in 100.</span>
    </div>
  );
}
