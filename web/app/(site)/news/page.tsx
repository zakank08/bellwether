import type { Metadata } from "next";
import Link from "next/link";
import NewsFeed from "@/components/NewsFeed";
import { getNews } from "@/lib/news";

export const metadata: Metadata = { title: "Latest updates", description: "New polls, shifts in control odds, the races that moved most this week, and notes from the Bellwether team." };

export default function NewsPage() {
  const items = getNews();
  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <header className="masthead">
        <div className="kicker">Latest</div>
        <h1>Updates</h1>
        <p className="dek">New polls, changes in the odds of controlling each chamber, and the races whose odds moved most this week. Items are generated from the forecast data each time it refreshes; notes from the team always name a source. Also available as a <a href="/feed.xml">feed</a>.</p>
      </header>
      <NewsFeed items={items} />
      <p className="small muted" style={{ marginTop: 28 }}>Odds are the share of simulations each side wins; they are not predictions of certainty. <Link href="/methodology/">How the model works</Link>.</p>
    </div>
  );
}
