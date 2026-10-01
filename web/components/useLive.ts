"use client";
import { useEffect, useState } from "react";
import { LIVE_BASE, type LiveResults, type LiveStatus } from "@/lib/livefeed";

type State = { results: LiveResults | null; status: LiveStatus | null; error: boolean; fetchedAt: number | null };
const subs = new Set<(s: State) => void>();
let cur: State = { results: null, status: null, error: false, fetchedAt: null };
let timer: ReturnType<typeof setInterval> | null = null;

async function pull() {
  try {
    const [r, s] = await Promise.all([fetch(`${LIVE_BASE}/results.json`, { cache: "no-store" }).then((x) => x.json()), fetch(`${LIVE_BASE}/status.json`, { cache: "no-store" }).then((x) => x.json())]);
    cur = { results: r, status: s, error: false, fetchedAt: Date.now() };
  } catch { cur = { ...cur, error: true }; }
  subs.forEach((f) => f(cur));
}

/** One shared poll (every 15 s) no matter how many panels are on the page. Does nothing until NEXT_PUBLIC_LIVE_URL is set. */
export function useLive(): State & { on: boolean } {
  const [s, set] = useState(cur);
  useEffect(() => {
    if (!LIVE_BASE) return;
    subs.add(set);
    if (!timer) { pull(); timer = setInterval(pull, 15000); }
    else set(cur);
    return () => { subs.delete(set); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
  }, []);
  return { ...s, on: !!LIVE_BASE };
}
