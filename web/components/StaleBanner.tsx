"use client";
import { useEffect, useState } from "react";
import { fmtUpdated } from "@/lib/format";

/** Shown only if the forecast hasn't refreshed for 30+ hours (a refresh job
 * failed). Reads the live forecast file so it reflects the current deploy. */
export default function StaleBanner({ updated }: { updated: string }) {
  const [age, setAge] = useState<number | null>(null);
  const [latest, setLatest] = useState(updated);
  useEffect(() => {
    let ts = updated;
    fetch("/data/forecast.json", { cache: "no-store" }).then((r) => r.json()).then((f) => { if (f?.updated) { ts = f.updated; setLatest(ts); } }).catch(() => {})
      .finally(() => setAge((Date.now() - new Date(ts).getTime()) / 36e5));
  }, [updated]);
  if (age == null || age < 30) return null;
  return (
    <div className="stale-banner" role="status">
      <div className="wrap"><strong>Heads up:</strong> the forecast hasn’t updated since {fmtUpdated(latest)}. Numbers may be out of date while we fix a data problem.</div>
    </div>
  );
}
