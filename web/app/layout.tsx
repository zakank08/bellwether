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
  title: { default: "Bellwether — 2026 midterm forecast", template: "%s · Bellwether" },
  description: "A nonpartisan forecast of the 2026 Senate, House and governor races: polling averages, a probabilistic model and a what-if map.",
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
            <Link href="/" className="brand">Bellwether</Link>
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
            <p>Bellwether is a nonpartisan election forecast. Odds are the share of simulations each side wins; they are not predictions of certainty.
              Polls: VoteHub Polling API. Races and candidates: Wikipedia (CC BY-SA 4.0). Pollster history: FiveThirtyEight/ABC News (CC BY 4.0).
              See the <Link href="/methodology/">methodology</Link> for every source and modeling choice.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
