import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { getRaces } from "@/lib/data";
import Search from "@/components/Search";
import ThemeToggle from "@/components/ThemeToggle";
import Nav from "@/components/Nav";

const display = Newsreader({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-newsreader", display: "swap" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://bellwether-zak.vercel.app"),
  title: { default: "Bellwether — 2026 midterm forecast", template: "%s · Bellwether" },
  description: "A nonpartisan forecast of the 2026 Senate, House and governor races: polling averages, a probabilistic model and a what-if map.",
  openGraph: { type: "website", siteName: "Bellwether", images: [{ url: "/og.png", width: 1200, height: 630, alt: "Bellwether 2026 midterm forecast: chances of Senate and House control" }] },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#faf9f6" }, { media: "(prefers-color-scheme: dark)", color: "#121314" }],
};

// Apply a saved theme before first paint (no flash).
const themeScript = `try{var t=localStorage.getItem('bw-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const index = getRaces().map((r) => ({
    id: r.id, t: r.title, o: r.office,
    c: [r.dside.name, r.rside.name, r.incumbent].filter(Boolean).join(" · "),
  }));
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
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
        <main id="main">{children}</main>
        <footer className="site-foot">
          <div className="wrap">
            <div className="cols">
              <div><h4>Forecast</h4><ul><li><Link href="/">Overview</Link></li><li><Link href="/senate/">Senate</Link></li><li><Link href="/house/">House</Link></li><li><Link href="/governor/">Governors</Link></li><li><Link href="/whatif/">Build your own map</Link></li><li><Link href="/schedule/">Election night schedule</Link></li></ul></div>
              <div><h4>Polls</h4><ul><li><Link href="/polls/">Generic ballot</Link></li><li><Link href="/polls/">Presidential approval</Link></li><li><Link href="/pollsters/">Pollster ratings</Link></li></ul></div>
              <div><h4>About</h4><ul><li><Link href="/methodology/">How the model works</Link></li><li><Link href="/methodology/">Backtest and calibration</Link></li><li><a href="https://github.com/zakank08/bellwether" rel="noopener noreferrer" target="_blank">Source code</a></li></ul></div>
            </div>
            <p>Bellwether is a nonpartisan election forecast. Odds are the share of simulations each side wins; they are not predictions of certainty.
              Polls: VoteHub Polling API. Races and candidates: Wikipedia (CC BY-SA 4.0). Pollster history: FiveThirtyEight/ABC News (CC BY 4.0).
              See the <Link href="/methodology/">methodology</Link> for every source and modeling choice.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
