"use client";

import { KeyRound, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  resetAccountPasswordAction,
  updateAccountNameAction,
} from "@/app/actions/accounts";
import { Button } from "@/components/ui/button";
import { PasswordDialog } from "./account-manager";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";

/** 本人用: 自分の表示名変更・パスワード変更(全アカウント種別で利用可)。 */
export function SelfAccountActions({
  userId,
  userName,
  demo,
}: {
  userId: string;
  userName: string;
  demo: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"name" | "password" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [name, setName] = React.useState(userName);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, doneMsg: string) =>
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "エラーが発生しました");
        return;
      }
      setNotice(doneMsg);
      setDialog(null);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setDialog("name")}>
          <Pencil className="h-3.5 w-3.5" />
          名前を変更
        </Button>
        {!demo && (
          <Button type="button" variant="outline" size="sm" onClick={() => setDialog("password")}>
            <KeyRound className="h-3.5 w-3.5" />
            パスワードを変更
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && !error && <p className="text-sm text-success">{notice}</p>}

      {dialog === "name" && (
        <Dialog open onClose={() => setDialog(null)} title="名前を変更">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => updateAccountNameAction(userId, name), "名前を変更しました。");
            }}
            className="space-y-4"
          >
            <Field label="名前">
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </Field>
            <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
              <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
                キャンセル
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "保存中…" : "保存"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {dialog === "password" && (
        <PasswordDialog
          title="パスワードを変更"
          description="次回ログインから新しいパスワードを使用します。"
          pending={pending}
          onClose={() => setDialog(null)}
          onSubmit={(v) =>
            run(() => resetAccountPasswordAction(userId, v), "パスワードを変更しました。")
          }
        />
      )}
    </div>
  );
}
