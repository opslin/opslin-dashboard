import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// The Media page talks straight to each customer's own Cloudflare addresses (their upload service on *.workers.dev and
// their image domain, whatever it is), so only that page may connect to any https address. Every other page keeps the
// narrow list.
const buildContentSecurityPolicy = (mediaPage: boolean) => [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.razorpay.com https://static.cloudflareinsights.com",
  "script-src-elem 'self' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${API_URL} https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com https://cloudflareinsights.com wss: ws:${mediaPage ? " https:" : ""}`,
  "img-src 'self' data: https:",
  "font-src 'self' https://fonts.gstatic.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

const contentSecurityPolicy = buildContentSecurityPolicy(false);
const mediaContentSecurityPolicy = buildContentSecurityPolicy(true);

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "opslin.com",
    "app.opslin.com",
    "api.opslin.com",
    "admin.opslin.com",
    "docs.opslin.com",
  ],
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: "appopslin.shotlin.in" }],
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/",
        has: [{ type: "host", value: "docopslin.shotlin.in" }],
        destination: "/docs",
        permanent: false,
      },
      {
        source: "/",
        has: [{ type: "host", value: "adminopslin.shotlin.in" }],
        destination: "https://admin.opslin.com",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      // Dev-only: stop a stale JS chunk from being served after a rebuild.
      // Turbopack's DEV chunk filenames are content-STABLE across rebuilds
      // (unlike a production build's content-hashed names), and when this
      // dev server is reached through the Cloudflare tunnel, Cloudflare
      // overrides its own `Cache-Control: no-cache` with a zone-level
      // `max-age=14400` for `_next/static/*`. The result, hit three separate
      // times during development: the browser keeps executing an hours-old
      // chunk after the source changed — including transiently-broken
      // intermediate compilations — producing errors that don't exist in the
      // code on disk ("configOpen is not defined" for a variable that is
      // plainly declared). `no-store` + `private` is the combination
      // Cloudflare honors as "never cache this, anywhere".
      // Production builds are untouched: they use content-hashed filenames,
      // where long-lived caching is correct and wanted.
      ...(process.env.NODE_ENV === "development"
        ? [{
          source: "/_next/static/:path*",
          headers: [
            { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
          ],
        }]
        : []),
      // One policy per page: Media gets the wider connect list, everything else the narrow one (two policies on one
      // response would be combined and the stricter would win).
      { source: "/media", headers: [{ key: "Content-Security-Policy", value: mediaContentSecurityPolicy }] },
      { source: "/((?!media$).*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
