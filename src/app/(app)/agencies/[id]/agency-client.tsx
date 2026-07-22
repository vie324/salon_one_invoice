"use client";

import { Mail, Pencil, Plus, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  createAgencyMemberAction,
  sendAgencyStatementAction,
  updateAgencyAction,
  updateAgencyMemberAction,
} from "@/app/actions/agencies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { Agency, AgencyMember } from "@/lib/domain/types";

/** 代理店情報の編集ダイアログ */
export function AgencyEditButton({ agency }: { agency: Agency }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: agency.name,
    contactName: agency.contactName,
    email: agency.email,
    phone: agency.phone,
    address: agency.address,
    commissionPercent: Math.round(agency.commissionRate * 100),
    notes: agency.notes,
    active: agency.active,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await updateAgencyAction(agency.id, {
        name: form.name.trim(),
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        commissionRate: Math.max(0, form.commissionPercent) / 100,
        notes: form.notes,
        active: form.active,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error ?? "保存に失敗しました");
    });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        代理店情報を編集
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="代理店情報の編集">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="代理店名">
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="担当者">
              <Input value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="メールアドレス" hint="支払明細の送付先">
              <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="電話番号">
              <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
          </div>
          <Field label="住所">
            <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 items-end gap-4">
            <Field label="手数料率（%）">
              <Input
                type="number"
                min={0}
                max={100}
                value={form.commissionPercent}
                onChange={(e) => set({ commissionPercent: Number(e.target.value) })}
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-primary)]"
                checked={form.active}
                onChange={(e) => set({ active: e.target.checked })}
              />
              取引中
            </label>
          </div>
          <Field label="メモ">
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={submit} disabled={pending || !form.name.trim()}>
              保存する
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** 営業マンの一覧・追加・編集 */
export function MemberManager({
  agencyId,
  members,
}: {
  agencyId: string;
  members: AgencyMember[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [dialog, setDialog] = React.useState<{ mode: "new" } | { mode: "edit"; member: AgencyMember } | null>(null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [active, setActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const openNew = () => {
    setName("");
    setEmail("");
    setActive(true);
    setError(null);
    setDialog({ mode: "new" });
  };
  const openEdit = (member: AgencyMember) => {
    setName(member.name);
    setEmail(member.email);
    setActive(member.active);
    setError(null);
    setDialog({ mode: "edit", member });
  };

  const submit = () =>
    start(async () => {
      setError(null);
      if (!name.trim()) return setError("氏名を入力してください");
      const res =
        dialog?.mode === "edit"
          ? await updateAgencyMemberAction(dialog.member.id, agencyId, {
              name: name.trim(),
              email,
              active,
            })
          : await createAgencyMemberAction({ agencyId, name: name.trim(), email });
      if (res.ok) {
        setDialog(null);
        router.refresh();
      } else setError(res.error ?? "保存に失敗しました");
    });

  return (
    <div className="space-y-3">
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">営業マンが未登録です。</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name}</div>
                  {m.email && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!m.active && <Badge tone="neutral">停止</Badge>}
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => openEdit(m)}
                  aria-label={`${m.name}を編集`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" onClick={openNew}>
        <Plus className="h-4 w-4" />
        営業マンを追加
      </Button>

      <Dialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog?.mode === "edit" ? "営業マンの編集" : "営業マンの追加"}
      >
        <div className="space-y-4">
          <Field label="氏名">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="山田 太郎" />
          </Field>
          <Field label="メールアドレス（任意）">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {dialog?.mode === "edit" && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-primary)]"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              稼働中（チェックを外すと停止）
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={submit} disabled={pending || !name.trim()}>
              保存する
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/** 支払明細のメール送付ボタン */
export function SendStatementButton({
  agencyId,
  month,
  hasEmail,
}: {
  agencyId: string;
  month: string;
  hasEmail: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [flash, setFlash] = React.useState<string | null>(null);

  const send = () =>
    start(async () => {
      const res = await sendAgencyStatementAction(agencyId, month);
      setFlash(res.ok ? (res.emailResult ?? "送信しました") : (res.error ?? "送信に失敗しました"));
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={send} disabled={pending} title={hasEmail ? undefined : "代理店のメールアドレスを設定してください"}>
        <Mail className="h-4 w-4" />
        支払明細をメール送付
      </Button>
      {flash && (
        <span className="rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground">{flash}</span>
      )}
    </div>
  );
}
