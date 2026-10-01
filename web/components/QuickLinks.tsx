import Link from "next/link";

const ITEMS: [string, string, string, string][] = [
  ["/find/", "Find my races", "Enter a ZIP code to see everything on your ballot.", "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
  ["/whatif/", "Build your own map", "Pick winners and watch the odds of control change.", "M4 20V10M10 20V4M16 20v-7M22 20H2"],
  ["/compare/", "Compare two races", "Put any two races side by side.", "M8 4H4v16h4M16 4h4v16h-4M12 3v18"],
  ["/states/", "Browse by state", "Every race on each state’s ballot.", "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"],
  ["/schedule/", "Election night", "When polls close, hour by hour.", "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"],
  ["/news/", "Latest updates", "New polls and shifts in the odds.", "M4 5h16M4 10h16M4 15h10M4 20h7"],
];

/** Six big, plain-language doors into the site, so a first-time visitor never has to guess where to go. */
export default function QuickLinks() {
  return (
    <nav className="quick" aria-label="Where to go">
      {ITEMS.map(([href, title, sub, d]) => (
        <Link key={href} href={href} className="quick-item">
          <span className="quick-ic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg></span>
          <span><strong>{title}</strong><span className="small muted">{sub}</span></span>
        </Link>
      ))}
    </nav>
  );
}
