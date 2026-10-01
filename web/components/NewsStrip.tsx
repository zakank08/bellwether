import Link from "next/link";
import { KIND_LABEL, type NewsItem } from "@/lib/newstypes";
import { NewsLink } from "./NewsBar";

export const fmtNewsDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Home page: the top few updates as cards. Each card says what kind of item it is, when, and where it comes from. */
export default function NewsStrip({ items }: { items: NewsItem[] }) {
  if (!items.length) return null;
  return (
    <section className="news-strip" aria-labelledby="news-h">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 id="news-h" className="display">Latest</h2>
        <Link href="/news/" className="small">All updates →</Link>
      </div>
      <div className="news-cards">
        {items.slice(0, 4).map((it) => (
          <article key={it.id} className={`news-card k-${it.kind}`}>
            <div className="kicker">{KIND_LABEL[it.kind]} · {fmtNewsDate(it.date)}</div>
            <h3><NewsLink it={it}>{it.headline}</NewsLink></h3>
            {it.detail && <p className="small muted">{it.detail}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}
