import { Suspense } from "react";
import { LogoStacked } from "@/components/brand/logo";
import { isDemoMode } from "@/lib/config";
import { DemoLoginForm } from "./demo-login-form";
import { LoginForm } from "./login-form";

export const metadata = { title: "ログイン" };

// ログイン状態(cookie/セッション)に応じて middleware が振り分けるため、
// このページはキャッシュせず常にサーバーで描画する
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-secondary via-background to-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <LogoStacked />
          <p className="mt-2 text-center text-sm text-muted-foreground">サロン請求・入金管理</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {/* useSearchParams を使うクライアントフォームは Suspense 境界が必要
              (プレビュー/本番ビルドでのみ顕在化する) */}
          <Suspense fallback={null}>
            {isDemoMode ? <DemoLoginForm /> : <LoginForm />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
