"use client";
import { useEffect, useState } from "react";

type StateStatus = { state: "ok" | "partial" | "stale" | "down" | "paused"; last_success: string | null; message?: string };
type Status = { updated: string; states: Record<string, StateStatus>; by_hand?: string[]; override_errors?: string[] };

/** Election-night feed health, shown site-wide once live results are switched on (NEXT_PUBLIC_LIVE_URL is set
 * to the storage address). Quiet when everything is fine; names the states that are behind or entered by hand. */
export default function LiveFeedBanner() {
  const base = process.env.NEXT_PUBLIC_LIVE_URL;
  const [s, setS] = useState<Status | null>(null);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    if (!base) return;
    let alive = true;
    const load = () => fetch(`${base}/status.json`, { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (alive) { setS(j); setLost(false); } }).catch(() => { if (alive) setLost(true); });
    load();
    const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [base]);
  if (!base || (!s && !lost)) return null;
  const behind = s ? Object.entries(s.states).filter(([, v]) => v.state === "stale" || v.state === "down").map(([k]) => k) : [];
  const old = s ? (Date.now() - new Date(s.updated).getTime()) / 60000 : 0;
  const hand = s?.by_hand?.length ?? 0;
  const bad = s?.override_errors?.length ?? 0;
  if (!lost && old < 5 && !behind.length && !hand && !bad) return null;
  return (
    <div className="stale-banner" role="status">
      <div className="wrap">
        {lost || old >= 5
          ? <><strong>Live results are delayed.</strong> We can’t reach the results feed right now; the numbers below may be several minutes behind. Counting continues.</>
          : <>
              {behind.length > 0 && <><strong>Delayed:</strong> {behind.join(", ")} {behind.length === 1 ? "is" : "are"} not updating from the state’s site; we’re showing the last numbers we received. </>}
              {bad > 0 && <><strong>Hand-correction problem:</strong> {s?.override_errors?.join("; ")}. </>}
              {hand > 0 && <>{hand} race{hand === 1 ? " was" : "s were"} entered by hand from official sources and {hand === 1 ? "is" : "are"} labeled that way.</>}
            </>}
      </div>
    </div>
  );
}
