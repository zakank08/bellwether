import Link from "next/link";
import type { NewsItem } from "@/lib/newstypes";

const isExternal = (h?: string) => !!h && /^https?:/.test(h);

export function NewsLink({ it, children }: { it: NewsItem; children: React.ReactNode }) {
  if (!it.href) return <>{children}</>;
  return isExternal(it.href)
    ? <a href={it.href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <Link href={it.href}>{children}</Link>;
}

/** One calm line under the header: the newest few items, with a link to everything. Static, never scrolls on its own. */
export default function NewsBar({ items }: { items: NewsItem[] }) {
  if (!items.length) return null;
  return (
    <div className="news-bar" aria-label="Latest updates">
      <div className="wrap">
        <Link href="/news/" className="news-tag">Latest</Link>
        <ul>
          {items.slice(0, 3).map((it) => (
            <li key={it.id}><NewsLink it={it}>{it.short ?? it.headline}</NewsLink></li>
          ))}
        </ul>
        <Link href="/news/" className="news-all">All updates →</Link>
      </div>
    </div>
  );
}
