/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    return {
      // beforeFiles runs ahead of the page router, so it can override the
      // root trip-home page: the bare apex of the Aerie brand domain serves
      // the product flyer instead of the (token-gated) guest home.
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "host", value: "^(www\\.)?aeriepc\\.com$" }],
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
