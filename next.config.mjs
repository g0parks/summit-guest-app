/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    return {
      // The Aerie domain is MARKETING-ONLY: its bare apex always serves the
      // flyer (never the app's "/" trip home). The guest app + demo live on
      // the app host (summit-guest-app.vercel.app), so "/" here never needs to
      // be the app — no cookie disambiguation, no demo bounce.
      beforeFiles: [
        {
          source: "/",
          has: [
            {
              type: "host",
              value: "^(aerie\\.summitluxurylogistics\\.com|(www\\.)?aeriepc\\.com)$",
            },
          ],
          destination: "/aerie.html",
        },
      ],
      // Clean /aerie path → the flyer, on any host (e.g. the .vercel.app URL).
      afterFiles: [{ source: "/aerie", destination: "/aerie.html" }],
    };
  },
};

export default nextConfig;
