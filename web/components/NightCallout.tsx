"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const FROM = Date.parse("2026-11-03T12:00:00Z");   // 7 a.m. Eastern on Election Day
const TO = Date.parse("2026-11-06T00:00:00Z");

/** A bold, single-line door to the live board, shown on every page from the morning of Election Day until it is over. */
export default function NightCallout() {
  const [show, setShow] = useState(false);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const n = Date.now();
    setShow(n >= FROM && n < TO);
    setLive(n >= Date.parse("2026-11-03T23:00:00Z"));
  }, []);
  if (!show) return null;
  return (
    <Link href="/election-night/" className="night-callout">
      <span className="wrap">
        <span className="night-dot" aria-hidden="true" />
        <strong>{live ? "Election night: live results" : "Election Day"}</strong>
        <span className="night-sub">{live ? "Senate, House and every race, as the votes come in" : "Live results start when the first polls close at 6 p.m. Eastern"}</span>
        <span className="night-go">Open the live board →</span>
      </span>
    </Link>
  );
}
