import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained build under .next/standalone — required for the
  // Docker runtime stage which copies only that directory and public/.
  output: "standalone",
  transpilePackages: [
    "@blocknote/core",
    "@blocknote/react",
    "@blocknote/shadcn",
    "@blocknote/mantine",
  ],
};

export default nextConfig;
