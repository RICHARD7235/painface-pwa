import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for PWA deployment
  // Note: removed 'output: export' to keep SSR for dynamic routes
  // PWA will work via service worker caching

  // Allow MediaPipe CDN resources
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
