import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Lambda (packaged by scripts/package-lambda.ts, T034).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
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
