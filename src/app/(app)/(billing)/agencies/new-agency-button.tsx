"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createAgencyAction } from "@/app/actions/agencies";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { DealTypePicker } from "./deal-type-picker";
import type { AgencyDealType } from "@/lib/domain/types";

export function NewAgencyButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    defaultDealType: "referral" as AgencyDealType,
    notes: "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    setError(null);
    if (!form.name.trim()) return setError("代理店名を入力してください。");
    start(async () => {
      const res = await createAgencyAction({
        name: form.name.trim(),
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        defaultDealType: form.defaultDealType,
        notes: form.notes,
      });
      if (res.ok) {
        setOpen(false);
        router.push(`/agencies/${res.id}`);
        router.refresh();
      } else setError(res.error ?? "登録に失敗しました。");
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        新規代理店
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="新規代理店の登録">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="代理店名">
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="株式会社○○" />
            </Field>
            <Field label="担当者">
              <Input value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="メールアドレス" hint="支払明細の送付先になります">
              <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="電話番号">
              <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
          </div>
          <Field label="住所">
            <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field
            label="区分（報酬）"
            hint="代理店URLから申し込んだお客様の既定の区分です。案件ごとに変えることもできます。"
          >
            <DealTypePicker
              value={form.defaultDealType}
              onChange={(t) => set({ defaultDealType: t })}
            />
          </Field>
          <Field label="メモ">
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="契約条件・特記事項など" />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={submit} disabled={pending}>
              登録する
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
