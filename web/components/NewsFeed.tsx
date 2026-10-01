"use client";
import { useState } from "react";
import { KIND_LABEL, type NewsItem, type NewsKind } from "@/lib/newstypes";
import { NewsLink } from "./NewsBar";
import { fmtNewsDate } from "./NewsStrip";

/** The full list, grouped by day, with filters. Filtering is plain buttons; every item stays a normal link. */
export default function NewsFeed({ items }: { items: NewsItem[] }) {
  const [kind, setKind] = useState<NewsKind | "all">("all");
  const kinds = (Object.keys(KIND_LABEL) as NewsKind[]).filter((k) => items.some((i) => i.kind === k));
  const shown = items.filter((i) => kind === "all" || i.kind === kind);
  const groups: [string, NewsItem[]][] = [];
  for (const it of shown) {
    const g = groups[groups.length - 1];
    if (g && g[0] === it.date) g[1].push(it); else groups.push([it.date, [it]]);
  }
  return (
    <>
      <div className="toggle" role="group" aria-label="Filter updates" style={{ margin: "12px 0 20px" }}>
        {(["all", ...kinds] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "all" ? "Everything" : KIND_LABEL[k]}</button>
        ))}
      </div>
      {groups.length === 0 && <p className="muted">Nothing here yet.</p>}
      {groups.map(([date, its]) => (
        <section key={date} className="news-day">
          <h2 className="kicker">{new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</h2>
          <ul>
            {its.map((it) => (
              <li key={it.id} className={`news-item k-${it.kind}`}>
                <span className="chip news-chip">{KIND_LABEL[it.kind]}</span>
                <div>
                  <div className="news-head"><NewsLink it={it}>{it.headline}</NewsLink>{it.pinned && <span className="chip" style={{ marginLeft: 8, background: "var(--signal-soft)" }}>Pinned</span>}</div>
                  {it.detail && <p className="small muted">{it.detail}</p>}
                  {it.source && <p className="small muted">Source: {it.source}{it.kind === "note" ? ` · ${fmtNewsDate(it.date)}` : ""}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
