import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Clean ScriptTag URL: /tracking.js?k=fb_… → App Router handler
      {
        source: "/tracking.js",
        destination: "/api/tracking.js",
      },
    ];
  },
  async headers() {
    return [
      {
        // Allow embedding in Shopify Admin (embedded apps)
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors https://admin.shopify.com https://*.myshopify.com;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
