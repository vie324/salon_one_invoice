import type { MetadataRoute } from "next";
import { appName } from "@/lib/config";

/**
 * PWA マニフェスト。
 * スマホの「ホーム画面に追加」でアプリのように起動できるようにする
 * (ブラウザのアドレスバーが消え、画面が縦に広く使える)。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${appName} — サロン請求・入金管理`,
    short_name: appName,
    description:
      "請求書の作成・送付・入金確認と、開発進捗の共有をスマートフォンから行えます。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#0d3b33",
    lang: "ja",
    dir: "ltr",
    categories: ["business", "finance", "productivity"],
    // iOS の apple-touch-icon は app/apple-icon.tsx から Next が自動で <link> を出す
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "進捗ホーム", short_name: "ホーム", url: "/home" },
      { name: "開発進捗", short_name: "開発進捗", url: "/dev" },
      { name: "請求書", short_name: "請求書", url: "/invoices" },
      { name: "ダッシュボード", short_name: "ダッシュボード", url: "/dashboard" },
    ],
  };
}
