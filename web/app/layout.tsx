import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const display = Newsreader({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-newsreader", display: "swap" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  alternates: { types: { "application/atom+xml": "/feed.xml" } },
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
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
