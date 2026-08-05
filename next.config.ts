import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // nodemailer は Node.js 専用モジュールを使うためバンドルせず実行時に読み込む
  serverExternalPackages: ["nodemailer"],
  // 型チェックはビルド時に実施。ESLint はビルドをブロックしない(別途 npm run lint)。
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      // 開発依頼の添付画像(縮小済み data URL)を Server Action で受けるため拡大
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
