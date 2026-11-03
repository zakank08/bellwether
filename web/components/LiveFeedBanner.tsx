"use client";
import { useLive } from "./useLive";

/** Election-night feed health, shown site-wide. Quiet when everything is fine; names the states that are behind, results entered by hand,
 * and a worker that has stopped publishing. Before the night starts (nothing published yet) it shows nothing. */
export default function LiveFeedBanner() {
  const { status: s, error } = useLive();
  if (!s || !s.updated) return null;                       // nothing published yet: not election night
  const behind = Object.entries(s.states).filter(([, v]) => v.state === "stale" || v.state === "down").map(([k]) => k);
  const ageMin = (Date.now() - new Date(s.updated).getTime()) / 60000;
  const limit = Math.max(5, ((s.publish_every_s ?? 60) / 60) * 2.5 + 3);   // minutes of silence before we say the worker stopped
  const hand = s.by_hand?.length ?? 0;
  const bad = s.override_errors?.length ?? 0;
  const silent = ageMin > limit;
  if (!silent && !error && !behind.length && !hand && !bad) return null;
  return (
    <div className="stale-banner" role="status">
      <div className="wrap">
        {silent
          ? <><strong>Live results are delayed.</strong> We haven’t received new numbers for about {Math.round(ageMin)} minutes; what you see may be behind. Counting continues.</>
          : <>
              {behind.length > 0 && <><strong>Delayed:</strong> {behind.join(", ")} {behind.length === 1 ? "is" : "are"} not updating from the state’s site; we’re showing the last numbers we received. </>}
              {hand > 0 && <>{hand} race{hand === 1 ? " was" : "s were"} entered by hand from official sources and {hand === 1 ? "is" : "are"} labeled that way. </>}
              {bad > 0 && <><strong>Hand-correction problem:</strong> {s.override_errors?.join("; ")}.</>}
            </>}
      </div>
    </div>
  );
}
