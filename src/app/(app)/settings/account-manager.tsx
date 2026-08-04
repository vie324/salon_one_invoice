"use client";

import { AlertTriangle, KeyRound, Pencil, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  createAccountAction,
  deleteAccountAction,
  resetAccountPasswordAction,
  updateAccountNameAction,
  updateUserRolesAction,
} from "@/app/actions/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { ASSIGNABLE_ROLES, dualRoleLabels, roleLabels, roleTone } from "@/lib/domain/constants";
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
    | { kind: "roles"; target: UserProfile }
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

  const changeRoles = (userId: string, roles: Role[]) =>
    run(() => updateUserRolesAction(userId, roles), "役割を変更しました。");

  // 兼務(請求管理者×開発・修正管理者など)と、同一メールの重複アカウントを洗い出す
  const dualHolders = profiles.filter((p) => dualRoleLabels(p.roles).length > 0);
  const emailCounts = new Map<string, number>();
  for (const p of profiles) {
    const key = p.email.trim().toLowerCase();
    if (key) emailCounts.set(key, (emailCounts.get(key) ?? 0) + 1);
  }
  const duplicateEmails = [...emailCounts.entries()].filter(([, n]) => n > 1).map(([e]) => e);

  // 新規作成フォーム
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [newRoles, setNewRoles] = React.useState<Role[]>(["billing"]);

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await createAccountAction({ name, email, password, roles: newRoles });
      if (res.ok) {
        setName("");
        setEmail("");
        setPassword("");
        setNewRoles(["billing"]);
        setShowForm(false);
      }
      return res;
    }, `アカウントを作成しました。`);
  };

  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50";

  return (
    <div className="space-y-4">
      {/* 重複チェック: 兼務と、同じメールアドレスの二重登録を可視化する */}
      {(dualHolders.length > 0 || duplicateEmails.length > 0) && (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs">
          {dualHolders.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                役割を兼務しているアカウント
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {dualHolders.map((p) => (
                  <li key={p.id}>
                    {p.name || p.email}: {dualRoleLabels(p.roles).join(" ＋ ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {duplicateEmails.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                同じメールアドレスのアカウントが重複しています
              </p>
              <p className="mt-1 text-muted-foreground">
                {duplicateEmails.join("、")} — 同じ方であれば、片方を削除して役割をまとめてください。
              </p>
            </div>
          )}
        </div>
      )}

      <ul className="divide-y divide-border rounded-md border border-border">
        {profiles.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{p.name || "（名前未設定）"}</span>
                {p.id === currentUserId && <Badge tone="primary">自分</Badge>}
                {p.roles.map((r) => (
                  <Badge key={r} tone={roleTone[r]}>
                    {roleLabels[r]}
                  </Badge>
                ))}
                {dualRoleLabels(p.roles).length > 0 && <Badge tone="neutral">兼務</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{p.email || "—"}</div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setDialog({ kind: "roles", target: p })}
              >
                役割を変更
              </Button>
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
          <Field label="役割" hint="複数選択できます（例: 請求管理者 ＋ 開発・修正管理者）">
            <RoleCheckboxes value={newRoles} onChange={setNewRoles} />
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

      {/* 役割の変更(兼務可) */}
      {dialog?.kind === "roles" && (
        <RolesDialog
          target={dialog.target}
          pending={pending}
          onClose={() => setDialog(null)}
          onSubmit={(roles) => changeRoles(dialog.target.id, roles)}
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

/** 役割のチェックボックス群(兼務のため複数選択) */
function RoleCheckboxes({
  value,
  onChange,
}: {
  value: Role[];
  onChange: (roles: Role[]) => void;
}) {
  const toggle = (role: Role) =>
    onChange(value.includes(role) ? value.filter((r) => r !== role) : [...value, role]);
  return (
    <div className="space-y-2">
      {ASSIGNABLE_ROLES.map((r) => (
        <label
          key={r.value}
          className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-2.5 text-sm transition-colors hover:bg-muted/50"
        >
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
            checked={value.includes(r.value)}
            onChange={() => toggle(r.value)}
          />
          <span>
            <span className="font-medium">{r.label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{r.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

/** 役割の変更ダイアログ(兼務可) */
function RolesDialog({
  target,
  pending,
  onClose,
  onSubmit,
}: {
  target: UserProfile;
  pending: boolean;
  onClose: () => void;
  onSubmit: (roles: Role[]) => void;
}) {
  const [roles, setRoles] = React.useState<Role[]>(target.roles);
  const dual = dualRoleLabels(roles);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${target.name || "アカウント"} の役割`}
      description="複数の役割を兼務できます。管理者は要望の実行を承認する「承認者」になります。"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(roles);
        }}
        className="space-y-4"
      >
        <RoleCheckboxes value={roles} onChange={setRoles} />
        {dual.length > 0 && (
          <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
            兼務: {dual.join(" ＋ ")}（両方の画面・操作が使えるようになります）
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button type="submit" disabled={pending || roles.length === 0}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
