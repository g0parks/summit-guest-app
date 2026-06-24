/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    return {
      // beforeFiles runs ahead of the page router, so it can override the
      // root trip-home page: the bare apex of an Aerie domain serves the
      // product flyer instead of the (token-gated) guest home. Both the free
      // subdomain (live now) and the dedicated brand domain (when bought) are
      // matched, so whichever DNS is pointed first just works.
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
      fallback: [],
    };
  },
};

export default nextConfig;
