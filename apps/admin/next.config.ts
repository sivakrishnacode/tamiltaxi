import path from "node:path";

import type { NextConfig } from "next";

// Monorepo root: dependencies are hoisted there by npm workspaces.
const repoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  // Docker: .next/standalone/apps/admin/server.js (see apps/admin/Dockerfile).
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  poweredByHeader: false,
  // Splash and banner pictures (up to 2 MB) go through a Server Action; the default limit is 1 MB.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  // The Engage hub (9 Nov 2026) replaced Automations, Announcements and Splash & banners: old links land on its tabs.
  redirects() {
    return [
      { source: "/automations", destination: "/engage/automations", permanent: false },
      { source: "/automations/campaigns", destination: "/engage/campaigns", permanent: false },
      { source: "/announcements", destination: "/engage/in-app", permanent: false },
      { source: "/promos", destination: "/engage/in-app", permanent: false },
    ];
  },
};

export default nextConfig;
