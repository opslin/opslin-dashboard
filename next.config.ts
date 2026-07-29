import type { NextConfig } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.razorpay.com https://static.cloudflareinsights.com",
  "script-src-elem 'self' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${API_URL} https://api.razorpay.com https://checkout.razorpay.com https://lumberjack.razorpay.com https://cloudflareinsights.com wss: ws:`,
  "img-src 'self' data: https:",
  "font-src 'self' https://fonts.gstatic.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

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
    return [{
      source: "/(.*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: contentSecurityPolicy,
        },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
