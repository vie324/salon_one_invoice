"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

/**
 * ルートエラーバウンダリ。
 * サーバー例外(DBマイグレーション未適用・接続エラー等)で画面が
 * 「開かない」状態にならないよう、原因の手がかりと復帰手段を表示する。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="mt-4 text-lg font-bold">エラーが発生しました</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ページの表示中に問題が発生しました。「再試行」で復帰しない場合は、時間をおいて再度お試しください。
        </p>
        <div className="mt-4 rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
          <p className="break-all">{error.message || "不明なエラー"}</p>
          {error.digest && <p className="tabular mt-1">digest: {error.digest}</p>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          本番環境で「契約書」「代理店」ページのみエラーになる場合は、Supabase の
          マイグレーション（supabase/migrations/0007・0008）が未適用の可能性があります。
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={reset}>
            <RotateCw className="h-4 w-4" />
            再試行
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            ダッシュボードへ
          </Button>
        </div>
      </div>
    </div>
  );
}
