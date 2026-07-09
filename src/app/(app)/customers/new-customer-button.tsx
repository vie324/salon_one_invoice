"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createCustomerAction } from "@/app/actions/customers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { paymentMethodLabels } from "@/lib/domain/constants";
import type { PaymentMethod } from "@/lib/domain/types";

export function NewCustomerButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: "",
    kana: "",
    email: "",
    phone: "",
    address: "",
    paymentMethod: "direct_debit" as PaymentMethod,
    assignee: "",
  });

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    setError(null);
    if (!form.name.trim()) return setError("顧客名を入力してください。");
    start(async () => {
      const res = await createCustomerAction(form);
      if (res.ok) {
        setOpen(false);
        setForm({ name: "", kana: "", email: "", phone: "", address: "", paymentMethod: "direct_debit", assignee: "" });
        router.push(`/customers/${res.id}`);
      } else setError(res.error ?? "登録に失敗しました。");
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        新規顧客
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="新規顧客の登録">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="顧客名 / 会員名">
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="山田 花子" />
            </Field>
            <Field label="フリガナ">
              <Input value={form.kana} onChange={(e) => set({ kana: e.target.value })} placeholder="ヤマダ ハナコ" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="メールアドレス">
              <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="電話番号">
              <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
          </div>
          <Field label="住所">
            <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="支払方法">
              <Select
                value={form.paymentMethod}
                onChange={(e) => set({ paymentMethod: e.target.value as PaymentMethod })}
              >
                {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {paymentMethodLabels[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="社内担当者">
              <Input value={form.assignee} onChange={(e) => set({ assignee: e.target.value })} />
            </Field>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
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
