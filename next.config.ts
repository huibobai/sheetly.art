import type { NextConfig } from "next";
import { isPrelaunch, prelaunchResponseHeaders } from "./lib/launch";

const robotsHeaders = prelaunchResponseHeaders(isPrelaunch());

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    if (robotsHeaders.length === 0) {
      return [];
    }
    return [
      { source: "/", headers: robotsHeaders },
      { source: "/:path*", headers: robotsHeaders },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
