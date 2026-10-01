import type { MetadataRoute } from "next";
import { getForecast, getRaces } from "@/lib/data";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bellwether-zak.vercel.app";
  const lastModified = new Date(getForecast().updated);
  const pages = ["", "senate/", "house/", "governor/", "whatif/", "find/", "schedule/", "polls/", "pollsters/", "ratings/", "news/", "compare/", "states/", "glossary/", "polls/explorer/", "methodology/", "open-data/", "status/"];
  return [
    ...pages.map((p) => ({ url: `${base}/${p}`, lastModified })),
    ...[...new Set(getRaces().map((r) => r.state))].map((st) => ({ url: `${base}/state/${st.toLowerCase()}/`, lastModified })),
    ...getRaces().map((r) => ({ url: `${base}/race/${r.id}/`, lastModified })),
  ];
}
