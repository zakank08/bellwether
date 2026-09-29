"use client";
import { useEffect, useState } from "react";

/** Live countdown to a moment (e.g., the first polls closing). */
export default function Countdown({ to, label, after }: { to: string; label: string; after: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (now == null) return <div className="countdown" aria-hidden="true"><span className="skeleton" style={{ display: "inline-block", width: 280, height: 48 }} /></div>;
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <div className="countdown"><strong>{after}</strong></div>;
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5), m = Math.floor((ms % 36e5) / 6e4), s = Math.floor((ms % 6e4) / 1e3);
  const cells: [number, string][] = [[d, "days"], [h, "hours"], [m, "min"], [s, "sec"]];
  return (
    <div className="countdown" role="timer" aria-label={`${label}: ${d} days, ${h} hours, ${m} minutes`}>
      {cells.map(([v, u]) => <div key={u}><span className="display num">{String(v).padStart(2, "0")}</span><small>{u}</small></div>)}
    </div>
  );
}
