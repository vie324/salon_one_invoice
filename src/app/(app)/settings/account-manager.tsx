"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createAccountAction, updateUserRoleAction } from "@/app/actions/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { ASSIGNABLE_ROLES } from "@/lib/domain/constants";
import type { Role, UserProfile } from "@/lib/domain/types";

/** アカウント一覧(種別変更) + 新規作成。全体管理者のみ表示される。 */
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

  const changeRole = (userId: string, role: Role) =>
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await updateUserRoleAction(userId, role);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice("アカウント種別を変更しました。");
      router.refresh();
    });

  // 新規作成フォーム
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<Role>("billing");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const res = await createAccountAction({ name, email, password, role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice(`${name} さんのアカウントを作成しました。`);
      setName("");
      setEmail("");
      setPassword("");
      setShowForm(false);
      router.refresh();
    });
  };

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
        <form onSubmit={submit} className="space-y-3 rounded-md border border-border p-4">
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
          ※ デモモードの変更はメモリ上のみ（再起動でリセット）。本番は Supabase Auth にユーザーが作成されます。
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && !error && <p className="text-sm text-success">{notice}</p>}
    </div>
  );
}

/** 旧ロールを新種別セレクトの初期値へ寄せる(表示用) */
function legacyToNew(role: Role): Role {
  if (role === "owner") return "admin";
  if (role === "staff") return "billing";
  return role;
}
