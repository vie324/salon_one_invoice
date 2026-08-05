"use client";

import { LogIn } from "lucide-react";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { switchDemoRole } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { safeRedirectPath } from "@/lib/redirect";

/**
 * デモモードのログイン。
 * Supabase 未設定時でもゲストのまま入ることはできず、どのデモアカウントとして
 * ログインするかを選ぶ(選択内容が cookie に記録され、ログイン状態になる)。
 */
const DEMO_ACCOUNTS = [
  { value: "admin", label: "佐々木 涼（管理者）" },
  { value: "admin2", label: "高橋 誠（管理者）" },
  { value: "billing", label: "田中 美咲（請求管理者＋開発・修正管理者）" },
  { value: "dev", label: "山田 健（エンジニア）" },
  { value: "dev_manager", label: "小林 直樹（開発・修正管理者）" },
];

export function DemoLoginForm() {
  const params = useSearchParams();
  const [persona, setPersona] = React.useState("admin");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await switchDemoRole(persona);
      if (!res?.ok) {
        setError(res?.error ?? "ログインに失敗しました");
        return;
      }
      // フルナビゲーションで遷移し、新しいログイン状態でサーバー側の
      // 振り分け(種別に応じた入口)とアクセス制御を確実に通す
      window.location.assign(safeRedirectPath(params.get("redirect")));
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-md bg-secondary px-4 py-3 text-sm text-secondary-foreground">
        <p className="font-medium">デモモードで動作中</p>
        <p className="mt-1 text-xs">
          Supabase 未設定のため、デモアカウントでログインしてお試しいただけます（データはインメモリ）。
        </p>
      </div>
      <Field label="ログインするアカウント">
        <Select value={persona} onChange={(e) => setPersona(e.target.value)}>
          {DEMO_ACCOUNTS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        <LogIn className="h-4 w-4" />
        {pending ? "ログイン中…" : "ログイン"}
      </Button>
      <p className="text-xs text-muted-foreground">
        本番利用時は <code className="rounded bg-muted px-1">.env.local</code> に Supabase
        を設定すると、メールアドレスとパスワードによるログインになります。
      </p>
    </form>
  );
}
