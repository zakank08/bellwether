"use client";
import { useEffect, useState } from "react";
import { fmtUpdated } from "@/lib/format";

/** How old the published forecast is, read from the live file so it is current even on a cached page. */
export default function StatusAge({ updated }: { updated: string }) {
  const [latest, setLatest] = useState(updated);
  const [age, setAge] = useState<number | null>(null);
  useEffect(() => {
    let ts = updated;
    fetch("/data/forecast.json", { cache: "no-store" }).then((r) => r.json()).then((f) => { if (f?.updated) { ts = f.updated; setLatest(ts); } }).catch(() => {})
      .finally(() => setAge((Date.now() - new Date(ts).getTime()) / 36e5));
  }, [updated]);
  const hours = age ?? (Date.now() - new Date(updated).getTime()) / 36e5;
  const state = hours < 8 ? "ok" : hours < 14 ? "late" : "stale";
  const label = { ok: "Up to date", late: "A little behind", stale: "Out of date" }[state];
  const ago = hours < 1 ? "less than an hour ago" : hours < 48 ? `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"} ago` : `${Math.round(hours / 24)} days ago`;
  return (
    <div className={state === "ok" ? "small" : "notice"} role="status">
      <strong>{label}.</strong> The forecast was last refreshed {fmtUpdated(latest)} ({ago}). It refreshes several times a day; GitHub sometimes starts a refresh late.
    </div>
  );
}
