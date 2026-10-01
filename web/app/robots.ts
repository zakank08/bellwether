import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bellwether-zak.vercel.app";
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/embed/"] }], sitemap: `${base}/sitemap.xml` };
}
