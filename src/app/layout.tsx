import type { Metadata } from "next";
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
