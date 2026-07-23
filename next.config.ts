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
};

export default nextConfig;
