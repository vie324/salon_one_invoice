import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 型チェックはビルド時に実施。ESLint はビルドをブロックしない(別途 npm run lint)。
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
