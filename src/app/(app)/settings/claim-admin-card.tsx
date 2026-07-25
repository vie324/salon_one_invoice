"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { claimFirstAdminAction } from "@/app/actions/accounts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 初期セットアップ: 全体管理者が1人もいないときだけ表示される。
 * 自分を全体管理者にして、以降のアカウント管理をアプリ内で完結できるようにする。
 */
export function ClaimAdminCard() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const claim = () =>
    startTransition(async () => {
      setError(null);
      const res = await claimFirstAdminAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  return (
    <Card className="mt-6 border-primary/40">
      <CardHeader className="flex-row items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <CardTitle>初期セットアップ: 全体管理者の設定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          まだ全体管理者がいません。最初の1人として自分を全体管理者にすると、この画面から
          アカウントの作成・種別変更・パスワード再設定・削除ができるようになります。
        </p>
        <Button type="button" onClick={claim} disabled={pending}>
          <ShieldCheck className="h-4 w-4" />
          {pending ? "設定中…" : "自分を全体管理者にする"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
