import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: self-hostable on the VM (see admin/Dockerfile and
  // docs/docs/deployment-cost.md) — removes the Vercel dependency.
  output: "standalone",
};

export default nextConfig;
