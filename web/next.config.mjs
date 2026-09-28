/** Static export: every page is pre-rendered HTML + JSON on the CDN, so an
 * election-night traffic spike never reaches a server. The pipeline triggers a
 * redeploy (Vercel deploy hook) after each forecast run. */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default nextConfig;
