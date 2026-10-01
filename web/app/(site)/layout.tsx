import Link from "next/link";
import { getForecast, getRaces } from "@/lib/data";
import Nav from "@/components/Nav";
import Search from "@/components/Search";
import StaleBanner from "@/components/StaleBanner";
import LiveFeedBanner from "@/components/LiveFeedBanner";
import ThemeToggle from "@/components/ThemeToggle";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const index = getRaces().map((r) => ({
    id: r.id, t: r.title, o: r.office,
    c: [r.dside.name, r.rside.name, r.incumbent].filter(Boolean).join(" · "),
  }));
  return (
    <>
    <a href="#main" className="sr-only">Skip to content</a>
    <header className="site-head">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="Bellwether home">
          <svg width="26" height="16" viewBox="0 0 26 16" aria-hidden="true">
            <path d="M2 15 A11 11 0 0 1 13 4 L13 9 A6 6 0 0 0 7 15 Z" fill="var(--d-safe)" />
            <path d="M24 15 A11 11 0 0 0 13 4 L13 9 A6 6 0 0 1 19 15 Z" fill="var(--r-safe)" />
          </svg>
          Bellwether
        </Link>
        <Nav />
        <div className="head-tools">
          <Search index={index} />
          <ThemeToggle />
        </div>
      </div>
    </header>
    <StaleBanner updated={getForecast().updated} />
    <LiveFeedBanner />
    <main id="main">{children}</main>
    <footer className="site-foot">
      <div className="wrap">
        <div className="cols">
          <div><h4>Forecast</h4><ul><li><Link href="/">Overview</Link></li><li><Link href="/senate/">Senate</Link></li><li><Link href="/house/">House</Link></li><li><Link href="/governor/">Governors</Link></li><li><Link href="/whatif/">Build your own map</Link></li><li><Link href="/schedule/">Election night schedule</Link></li><li><Link href="/ratings/">Vs. expert ratings</Link></li></ul></div>
          <div><h4>Polls</h4><ul><li><Link href="/polls/">Generic ballot</Link></li><li><Link href="/polls/">Presidential approval</Link></li><li><Link href="/pollsters/">Pollster ratings</Link></li><li><Link href="/find/">Find my races</Link></li></ul></div>
          <div><h4>About</h4><ul><li><Link href="/methodology/">How the model works</Link></li><li><Link href="/methodology/">Backtest and calibration</Link></li><li><Link href="/status/">Data status</Link></li><li><Link href="/open-data/">Open data</Link></li><li><a href="/feed.xml">Feed of changes</a></li><li><a href="https://github.com/zakank08/bellwether" rel="noopener noreferrer" target="_blank">Source code</a></li></ul></div>
        </div>
        <p>Bellwether is a nonpartisan election forecast. Odds are the share of simulations each side wins; they are not predictions of certainty.
          Polls: VoteHub Polling API. Races and candidates: Wikipedia (CC BY-SA 4.0). Pollster history: FiveThirtyEight/ABC News (CC BY 4.0).
          See the <Link href="/methodology/">methodology</Link> for every source and modeling choice.</p>
      </div>
    </footer>
    </>
  );
}
