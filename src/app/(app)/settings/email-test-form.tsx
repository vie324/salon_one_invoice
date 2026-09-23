"use client";

import { PlugZap, Send } from "lucide-react";
import * as React from "react";
import { checkEmailConnectionAction, sendTestEmailAction } from "@/app/actions/email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * メール設定の確認用テスト送信。
 * お客様へ契約書や請求書を送る前に、自分のアドレスで実送信を確認する。
 * 届かないときの切り分け用に、送信せず接続だけ確かめる「接続確認」も用意する。
 */
export function EmailTestForm({ defaultTo }: { defaultTo: string }) {
  const [to, setTo] = React.useState(defaultTo);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      setResult(null);
      const res = await sendTestEmailAction(to);
      setResult(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
    });
  };

  const check = () => {
    startTransition(async () => {
      setResult(null);
      const res = await checkEmailConnectionAction();
      setResult(res.ok ? { ok: true, message: res.message } : { ok: false, message: res.error });
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="test@example.com"
          aria-label="テスト送信先のメールアドレス"
          className="sm:max-w-xs"
          required
        />
        <Button type="submit" variant="outline" disabled={pending}>
          <Send className="h-4 w-4" />
          {pending ? "実行中…" : "テスト送信"}
        </Button>
        <Button type="button" variant="ghost" onClick={check} disabled={pending}>
          <PlugZap className="h-4 w-4" />
          接続確認
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        「接続確認」はメールを送らずに、SMTPサーバーへ接続できるか（認証が通るか・送信元IPが許可されているか）だけを確かめます。
      </p>
      {result && (
        <p className={result.ok ? "text-sm text-success" : "text-sm text-destructive"}>
          {result.message}
        </p>
      )}
    </form>
  );
}
