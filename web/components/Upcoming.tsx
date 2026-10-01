"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Upcoming as U } from "@/lib/data";
import { fmtDate } from "@/lib/format";

/** Next elections on the calendar, with a live "in N days". */
export default function Upcoming({ items, limit = 3, showSource = false }: { items: U[]; limit?: number; showSource?: boolean }) {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })), []);
  const list = items.filter((e) => !today || e.date >= today).slice(0, limit);
  const days = (d: string) => today ? Math.round((new Date(d + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime()) / 864e5) : null;
  return (
    <>
    <ul className="upcoming">
      {list.map((e) => {
        const n = days(e.date);
        return (
          <li key={e.date + e.label}>
            <div className="when num">{fmtDate(e.date, { month: "short", day: "numeric" })}<span className="in">{n == null ? fmtDate(e.date, { year: "numeric" }) : n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}</span></div>
            <div>
              {e.href ? <Link href={e.href}><strong>{e.label}</strong></Link> : <strong>{e.label}</strong>}
              <div className="small muted">{e.detail}{showSource && <> Source: {e.source}.</>}</div>
            </div>
          </li>
        );
      })}
    </ul>
    <p className="small" style={{ marginTop: 8 }}><a href="/downloads/dates.ics">Add these dates to your calendar</a></p>
    </>
  );
}
