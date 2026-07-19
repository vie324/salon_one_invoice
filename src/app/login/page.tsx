import Link from "next/link";
import { Suspense } from "react";
import { LogoStacked } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { isDemoMode } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata = { title: "ログイン" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-secondary via-background to-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <LogoStacked />
          <p className="mt-2 text-center text-sm text-muted-foreground">サロン請求・入金管理</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {isDemoMode ? (
            <div className="space-y-4 text-center">
              <div className="rounded-md bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                <p className="font-medium">デモモードで動作中</p>
                <p className="mt-1 text-xs">
                  Supabase 未設定のため、サンプルデータで全機能をお試しいただけます。
                </p>
              </div>
              <Link href="/dashboard" className={buttonClasses({ className: "w-full" })}>
                デモを開始する
              </Link>
              <p className="text-xs text-muted-foreground">
                本番利用時は <code className="rounded bg-muted px-1">.env.local</code> に Supabase
                を設定するとログイン認証が有効になります。
              </p>
            </div>
          ) : (
            // useSearchParams を使うクライアントフォームは Suspense 境界が必要
            // (Supabase設定時のみ描画されるため、プレビュー/本番ビルドでのみ顕在化する)
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
