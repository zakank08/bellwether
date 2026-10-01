import fs from "node:fs";
import path from "node:path";
import { chamberHistory, getApproval, getForecast, getGeneric, getUpcoming, movers } from "./data";
import { in100, surname } from "./format";

import { KIND_LABEL as _L, type NewsItem, type NewsKind } from "./newstypes";
export { KIND_LABEL } from "./newstypes";
export type { NewsItem, NewsKind } from "./newstypes";
void _L;

type Note = { date: string; headline: string; detail?: string; href?: string; source: string; pinned?: boolean; pin_days?: number };

const days = (a: string, b: string) => Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 864e5);

function notes(): Note[] {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), "content", "news.json"), "utf8"));
    return (j.notes ?? []).filter((n: Note) => n.date && n.headline && n.source);
  } catch { return []; }
}

const side = (m: number) => (Math.abs(m) < 0.5 ? "tied" : m > 0 ? `Democrats +${Math.round(m)}` : `Republicans +${Math.round(-m)}`);
const fmtDay = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Everything on the Latest feed, newest first. Generated from the forecast files plus hand-written notes. Wording is symmetric:
 * both parties' odds are always shown, and nothing describes a candidate. */
export function getNews(): NewsItem[] {
  const f = getForecast(), asof = f.asof, out: NewsItem[] = [];

  for (const [i, n] of notes().entries()) {
    out.push({ id: `note-${i}`, kind: "note", date: n.date, headline: n.headline, detail: n.detail, href: n.href, source: n.source,
      pinned: !!n.pinned && days(n.date, asof) <= (n.pin_days ?? 3) });
  }

  const h = chamberHistory();
  if (h && h.points.length > 1) {
    const last = h.points[h.points.length - 1];
    const wk = [...h.points].reverse().find((p) => p.date <= new Date(new Date(last.date + "T12:00:00Z").getTime() - 7 * 864e5).toISOString().slice(0, 10));
    for (const [key, name, href] of [["senate", "Senate", "/senate/"], ["house", "House", "/house/"]] as const) {
      const now = last[key], was = wk?.[key];
      const lead = now.D >= now.R ? "D" : "R";
      const head = `${name} control: Democrats ${in100(now.D)} in 100, Republicans ${in100(now.R)} in 100`;
      let detail = `Share of ${f.n_sims.toLocaleString("en-US")} simulations each party wins.`;
      if (was) {
        const d = Math.round((now.D - was.D) * 100);
        detail = d === 0 ? `Unchanged from a week ago (Democrats ${in100(was.D)} in 100).`
          : `Democrats were ${in100(was.D)} in 100 on ${fmtDay(wk!.date)}: ${d > 0 ? "up" : "down"} ${Math.abs(d)} point${Math.abs(d) === 1 ? "" : "s"} in a week.`;
      }
      out.push({ id: `odds-${key}`, kind: "odds", date: last.date, headline: head, short: `${name}: Dem. ${in100(now.D)} · Rep. ${in100(now.R)} in 100`, detail, href, source: "Bellwether model" });
      void lead;
    }
  }

  for (const m of movers(7, 4)) {
    const d = surname(m.dside.name), r = surname(m.rside.name);
    out.push({ id: `race-${m.id}`, kind: "race", date: asof, headline: `${m.title}: ${d} ${in100(m.from)} → ${in100(m.to)} in 100 over the past week`, short: `${m.title}: ${d} ${in100(m.from)} → ${in100(m.to)}`,
      detail: `${r}: ${in100(1 - m.from)} → ${in100(1 - m.to)} in 100. Chance of winning, from the simulations.`, href: `/race/${m.id}/`, source: "Bellwether model" });
  }

  const recent = (end: string) => days(end, asof) <= 21 && days(end, asof) >= 0;
  const g = getGeneric().polls.filter((p) => recent(p.end)).sort((a, b) => b.end.localeCompare(a.end)).slice(0, 4);
  for (const p of g) {
    out.push({ id: `gen-${p.pollster}-${p.end}`, kind: "poll", date: p.end, headline: `Generic ballot: ${p.pollster} has ${side(p.raw)}`, short: `Poll: ${p.pollster}, ${side(p.raw)}`,
      detail: `Poll ended ${fmtDay(p.end)}${p.pop ? `, ${p.pop.toUpperCase()}` : ""}${p.n ? `, ${p.n.toLocaleString("en-US")} respondents` : ""}. Our adjusted figure: ${side(p.adjusted)}.`,
      href: p.url ?? "/polls/", source: p.url ? p.pollster : "Bellwether polling average" });
  }
  const a = getApproval().polls.filter((p) => recent(p.end)).sort((x, y) => y.end.localeCompare(x.end)).slice(0, 3);
  for (const p of a) {
    out.push({ id: `app-${p.pollster}-${p.end}`, kind: "poll", date: p.end, headline: `Presidential approval: ${p.pollster} has ${Math.round(p.approve)}% approve, ${Math.round(p.disapprove)}% disapprove`,
      detail: `Poll ended ${fmtDay(p.end)}${p.pop ? `, ${p.pop.toUpperCase()}` : ""}${p.n ? `, ${p.n.toLocaleString("en-US")} respondents` : ""}.`, href: p.url ?? "/polls/", source: p.pollster });
  }

  for (const u of getUpcoming()) {
    const away = days(asof, u.date);
    if (away >= 0 && away <= 35 && u.label) {
      out.push({ id: `date-${u.date}-${u.label}`, kind: "date", date: asof, headline: `${u.label}: ${away === 0 ? "today" : away === 1 ? "tomorrow" : `in ${away} days`} (${fmtDay(u.date)})`,
        detail: u.detail, href: u.href, source: u.source });
    }
  }

  const rank: Record<NewsKind, number> = { note: 0, odds: 1, race: 2, poll: 3, date: 4 };
  return out.sort((x, y) => Number(!!y.pinned) - Number(!!x.pinned) || y.date.localeCompare(x.date) || rank[x.kind] - rank[y.kind]);
}

/** The few items for the home strip and header bar: pinned notes first, then the two chamber odds, the biggest mover,
 * the newest poll, and a date only when it is within a week. */
export function topNews(n = 4): NewsItem[] {
  const all = getNews();
  const pick: (NewsItem | undefined)[] = [
    ...all.filter((i) => i.pinned),
    all.find((i) => i.id === "odds-senate"), all.find((i) => i.id === "odds-house"),
    all.find((i) => i.kind === "race"),
    all.find((i) => i.kind === "poll"),
    all.find((i) => i.kind === "date" && /today|tomorrow|in [1-7] days/.test(i.headline)),
  ];
  return pick.filter((i): i is NewsItem => !!i).slice(0, n);
}
