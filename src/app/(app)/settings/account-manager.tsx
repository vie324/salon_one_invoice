"use client";

import { KeyRound, Pencil, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  createAccountAction,
  deleteAccountAction,
  resetAccountPasswordAction,
  updateAccountNameAction,
  updateUserRoleAction,
} from "@/app/actions/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { ASSIGNABLE_ROLES } from "@/lib/domain/constants";
import type { Role, UserProfile } from "@/lib/domain/types";

/** アカウント一覧(種別変更・名前変更・パスワード再設定・削除) + 新規作成。全体管理者のみ。 */
export function AccountManager({
  profiles,
  currentUserId,
  demo,
}: {
  profiles: UserProfile[];
  currentUserId: string;
  demo: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [dialog, setDialog] = React.useState<
    | { kind: "name"; target: UserProfile }
    | { kind: "password"; target: UserProfile }
    | { kind: "delete"; target: UserProfile }
    | null
  >(null);

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

  const changeRole = (userId: string, role: Role) =>
    run(() => updateUserRoleAction(userId, role), "アカウント種別を変更しました。");

  // 新規作成フォーム
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<Role>("billing");

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await createAccountAction({ name, email, password, role });
      if (res.ok) {
        setName("");
        setEmail("");
        setPassword("");
        setShowForm(false);
      }
      return res;
    }, `アカウントを作成しました。`);
  };

  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-md border border-border">
        {profiles.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{p.name || "（名前未設定）"}</span>
                {p.id === currentUserId && <Badge tone="primary">自分</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{p.email || "—"}</div>
            </div>
            <div className="flex items-center gap-1.5">
              {/* 旧ロール(owner/staff)は相当する新種別として表示し、変更時に新種別へ移行する */}
              <Select
                value={legacyToNew(p.role)}
                disabled={pending}
                onChange={(e) => changeRole(p.id, e.target.value as Role)}
                className="h-9 w-auto min-w-[150px] text-xs"
                aria-label={`${p.name} の種別`}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <button
                type="button"
                className={iconBtn}
                title="名前を変更"
                aria-label={`${p.name} の名前を変更`}
                disabled={pending}
                onClick={() => setDialog({ kind: "name", target: p })}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={iconBtn}
                title="パスワードを再設定"
                aria-label={`${p.name} のパスワードを再設定`}
                disabled={pending}
                onClick={() => setDialog({ kind: "password", target: p })}
              >
                <KeyRound className="h-4 w-4" />
              </button>
              {p.id !== currentUserId && (
                <button
                  type="button"
                  className={`${iconBtn} hover:text-destructive`}
                  title="アカウントを削除"
                  aria-label={`${p.name} を削除`}
                  disabled={pending}
                  onClick={() => setDialog({ kind: "delete", target: p })}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="space-y-1 text-xs text-muted-foreground">
        {ASSIGNABLE_ROLES.map((r) => (
          <p key={r.value}>
            <span className="font-medium text-foreground">{r.label}</span>: {r.description}
          </p>
        ))}
      </div>

      {showForm ? (
        <form onSubmit={submitCreate} className="space-y-3 rounded-md border border-border p-4">
          <p className="text-sm font-semibold">新しいアカウントを作成</p>
          <Field label="名前">
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="山田 太郎" />
          </Field>
          <Field label="メールアドレス">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="taro@example.com"
              autoComplete="off"
            />
          </Field>
          <Field label="初期パスワード" hint="8文字以上。本人に伝え、初回ログイン後の変更を推奨します。">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <Field label="アカウント種別">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "作成中…" : "作成"}
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(true)}>
          <UserPlus className="h-4 w-4" />
          アカウントを作成
        </Button>
      )}

      {demo && (
        <p className="text-xs text-muted-foreground">
          ※ デモモードの変更はメモリ上のみ（再起動でリセット）。本番は Supabase Auth に反映されます（パスワード再設定はデモでは無効）。
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && !error && <p className="text-sm text-success">{notice}</p>}

      {/* 名前変更 */}
      {dialog?.kind === "name" && (
        <NameDialog
          target={dialog.target}
          pending={pending}
          onClose={() => setDialog(null)}
          onSubmit={(v) =>
            run(() => updateAccountNameAction(dialog.target.id, v), "名前を変更しました。")
          }
        />
      )}

      {/* パスワード再設定 */}
      {dialog?.kind === "password" && (
        <PasswordDialog
          title={`${dialog.target.name || "アカウント"} のパスワードを再設定`}
          description="新しいパスワードを本人に伝えてください。"
          pending={pending}
          onClose={() => setDialog(null)}
          onSubmit={(v) =>
            run(
              () => resetAccountPasswordAction(dialog.target.id, v),
              "パスワードを再設定しました。",
            )
          }
        />
      )}

      {/* 削除確認 */}
      {dialog?.kind === "delete" && (
        <Dialog
          open
          onClose={() => setDialog(null)}
          title={`${dialog.target.name || "アカウント"} を削除しますか？`}
          description="ログインできなくなります。過去の開発依頼・判定の履歴は名前付きで残ります。"
        >
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              キャンセル
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() =>
                run(() => deleteAccountAction(dialog.target.id), "アカウントを削除しました。")
              }
            >
              {pending ? "削除中…" : "削除する"}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** 名前変更ダイアログ */
function NameDialog({
  target,
  pending,
  onClose,
  onSubmit,
}: {
  target: UserProfile;
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = React.useState(target.name);
  return (
    <Dialog open onClose={onClose} title="名前を変更">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
        className="space-y-4"
      >
        <Field label="名前">
          <Input value={value} onChange={(e) => setValue(e.target.value)} required autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** パスワード入力ダイアログ(再設定・自分の変更で共用) */
export function PasswordDialog({
  title,
  description,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  description?: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
  const [value, setValue] = React.useState("");
  return (
    <Dialog open onClose={onClose} title={title} description={description}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
        className="space-y-4"
      >
        <Field label="新しいパスワード" hint="8文字以上">
          <Input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "変更中…" : "変更する"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** 旧ロールを新種別セレクトの初期値へ寄せる(表示用) */
function legacyToNew(role: Role): Role {
  if (role === "owner") return "admin";
  if (role === "staff") return "billing";
  return role;
}
