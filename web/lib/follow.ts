/** Followed races live in this browser only (localStorage), never on a server. */
export type FollowEntry = { seen: number; prev: number; at: number };
const KEY = "bw-follow";
const VISIT_GAP_MS = 6 * 36e5;

export function readFollows(): Record<string, FollowEntry> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {}; } catch { return {}; }
}
function write(v: Record<string, FollowEntry>) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); window.dispatchEvent(new Event("bw-follow")); } catch { /* storage unavailable: following just won't persist */ }
}
export function isFollowing(id: string) { return id in readFollows(); }
export function follow(id: string, p: number) { const f = readFollows(); f[id] = { seen: p, prev: p, at: Date.now() }; write(f); }
export function unfollow(id: string) { const f = readFollows(); delete f[id]; write(f); }

/** Roll each followed race forward once per visit (6+ hours apart), so the
 * change shown is "since your last visit". */
export function visit(current: Record<string, number>): Record<string, FollowEntry> {
  const f = readFollows();
  const now = Date.now();
  let changed = false;
  for (const [id, e] of Object.entries(f)) {
    const p = current[id];
    if (p == null) continue;
    if (now - e.at > VISIT_GAP_MS) { f[id] = { prev: e.seen, seen: p, at: now }; changed = true; }
    else if (e.seen !== p) { f[id] = { ...e, seen: p }; changed = true; }
  }
  if (changed) write(f);
  return f;
}
