import { getForecast, getUpcoming } from "@/lib/data";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (l: string) => (l.length <= 74 ? l : l.match(/.{1,73}/g)!.join("\r\n "));

/** Key election dates as a calendar file, so they can be added to any calendar app. All-day events, from upcoming.json (each with its source). */
export function GET() {
  const f = getForecast();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bellwether-zak.vercel.app";
  const stamp = f.updated.replace(/[-:]/g, "").replace(/\.\d+/, "").replace("+0000", "Z").replace("+00:00", "Z").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bellwether//Election dates//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Bellwether: 2026 election dates"];
  for (const u of getUpcoming()) {
    const d = u.date.replace(/-/g, "");
    const next = new Date(new Date(u.date + "T12:00:00Z").getTime() + 864e5).toISOString().slice(0, 10).replace(/-/g, "");
    lines.push("BEGIN:VEVENT", `UID:${d}-${u.label.replace(/\W+/g, "-").toLowerCase()}@bellwether`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${esc(u.label)}`,
      `DESCRIPTION:${esc(`${u.detail} Source: ${u.source}`)}`, `URL:${site}${u.href ?? "/"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
}
