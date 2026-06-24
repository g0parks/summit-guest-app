/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    // Clean /aerie path → the flyer, on any host (e.g. the .vercel.app URL).
    // The session-aware apex rewrite (Aerie domain root → flyer for cold
    // visitors only) lives in middleware.ts — cookie-conditional rewrites
    // aren't reliably evaluated here, so the apex logic is middleware's.
    return [{ source: "/aerie", destination: "/aerie.html" }];
  },
};

export default nextConfig;
