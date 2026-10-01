/** How many polls ended in the 30 days up to `asof`, so a thin or stale stretch is said plainly. */
export function coverage(polls: { end: string; src?: string }[], asof: string, days = 30) {
  const cutoff = new Date(new Date(asof).getTime() - days * 86400000).toISOString().slice(0, 10);
  const recent = polls.filter((p) => p.end >= cutoff && p.end <= asof);
  const latest = polls.reduce((m, p) => (p.end > m ? p.end : m), "");
  return { recent: recent.length, fromReleases: recent.filter((p) => p.src === "Pollster release").length, latest, thin: recent.length < 8 };
}
