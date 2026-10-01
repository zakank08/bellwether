import { getForecast, movers } from "@/lib/data";
import { in100, surname } from "@/lib/format";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Atom feed of the races whose odds moved most over the past week, regenerated with every forecast. */
export function GET() {
  const f = getForecast();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bellwether-zak.vercel.app";
  const items = movers(7, 12);
  const entries = items.map((m) => {
    const dir = m.to >= m.from ? "up" : "down";
    const d = surname(m.dside.name), r = surname(m.rside.name);
    const text = `${m.title}: ${d}’s chance of winning went ${dir} from ${in100(m.from)} in 100 to ${in100(m.to)} in 100 since ${m.since} (${r}: ${in100(1 - m.to)} in 100).`;
    return `  <entry>
    <id>${site}/race/${m.id}/#${f.asof}</id>
    <title>${esc(`${m.title}: ${in100(m.from)} → ${in100(m.to)} in 100 for ${d}`)}</title>
    <link href="${site}/race/${m.id}/"/>
    <updated>${f.updated}</updated>
    <summary>${esc(text)}</summary>
  </entry>`;
  });
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${site}/feed.xml</id>
  <title>Bellwether: biggest changes in the odds</title>
  <subtitle>Races whose chance of winning moved most over the past 7 days. Odds are the share of simulations each side wins.</subtitle>
  <link href="${site}/feed.xml" rel="self"/>
  <link href="${site}/"/>
  <updated>${f.updated}</updated>
${entries.join("\n")}
</feed>
`;
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
}
