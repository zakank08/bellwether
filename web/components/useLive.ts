"use client";
import { useEffect, useState } from "react";
import { isRehearsal, LIVE_BASE, LIVE_POLL_MS, type LiveResults, type LiveStatus } from "@/lib/livefeed";

type State = { results: LiveResults | null; status: LiveStatus | null; error: boolean; fetchedAt: number | null };
const subs = new Set<(s: State) => void>();
let cur: State = { results: null, status: null, error: false, fetchedAt: null };
let timer: ReturnType<typeof setInterval> | null = null;

async function pull() {
  try {
    const url = isRehearsal() ? "/data/live/rehearsal.json" : `${LIVE_BASE}/live.json`;
    const j = await fetch(url, { cache: "no-store" }).then((x) => { if (!x.ok) throw new Error(String(x.status)); return x.json(); });
    cur = { results: j.results, status: j.status, error: false, fetchedAt: Date.now() };
  } catch { cur = { ...cur, error: true }; }
  subs.forEach((f) => f(cur));
}

/** One shared poll no matter how many panels are on the page; one small file per request. */
export function useLive(): State & { on: boolean } {
  const [s, set] = useState(cur);
  useEffect(() => {
    subs.add(set);
    if (!timer) { pull(); timer = setInterval(pull, LIVE_POLL_MS); }
    else set(cur);
    return () => { subs.delete(set); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
  }, []);
  return { ...s, on: true };
}
