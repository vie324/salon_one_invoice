import type { Metadata, Viewport } from "next";
import { themeInitScript } from "@/components/theme-toggle";
import { appName } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${appName} — サロン請求・入金管理`,
    template: `%s — ${appName}`,
  },
  description:
    "サロン向けの請求書 作成・送付・管理アプリ。口座振替(引き落とし)と入金確認に対応。",
  applicationName: appName,
  // ホーム画面に追加したときにフルスクリーンのアプリとして開く
  appleWebApp: {
    capable: true,
    title: appName,
    statusBarStyle: "black-translucent",
  },
  // 電話番号・住所を iOS が勝手にリンク化して表示を崩すのを防ぐ
  formatDetection: { telephone: false, address: false, email: false },
};

/**
 * スマートフォンでの表示に必須の viewport 設定。
 * これが無いと iOS/Android が 980px 幅の PC 表示として描画し、
 * 文字が極端に小さくなる。viewportFit=cover はノッチ端末で
 * 画面いっぱいに描画し、余白は safe-area-inset-* で確保する。
 * maximumScale は拡大を妨げないよう 5 まで許可する(アクセシビリティ)。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0d3b33" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1a18" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
