"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { updateCustomerAction } from "@/app/actions/customers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { paymentMethodLabels } from "@/lib/domain/constants";
import type {
  Agency,
  AgencyMember,
  Customer,
  CustomerStatus,
  PaymentMethod,
} from "@/lib/domain/types";

/** 顧客情報の編集(メモ・獲得代理店の紐付けを含む)。 */
export function EditCustomerButton({
  customer,
  agencies,
  agencyMembers,
}: {
  customer: Customer;
  agencies: Agency[];
  agencyMembers: AgencyMember[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    name: customer.name,
    kana: customer.kana,
    contactName: customer.contactName,
    email: customer.email,
    phone: customer.phone,
    postalCode: customer.postalCode,
    address: customer.address,
    paymentMethod: customer.paymentMethod,
    status: customer.status,
    assignee: customer.assignee,
    notes: customer.notes,
    agencyId: customer.agencyId ?? "",
    agencyMemberId: customer.agencyMemberId ?? "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const membersOfAgency = agencyMembers.filter((m) => m.agencyId === form.agencyId);

  const submit = () =>
    start(async () => {
      setError(null);
      if (!form.name.trim()) return setError("顧客名を入力してください");
      const res = await updateCustomerAction(customer.id, {
        name: form.name.trim(),
        kana: form.kana,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        postalCode: form.postalCode,
        address: form.address,
        paymentMethod: form.paymentMethod,
        status: form.status,
        assignee: form.assignee,
        notes: form.notes,
        agencyId: form.agencyId || null,
        agencyMemberId: form.agencyId ? form.agencyMemberId || null : null,
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
        編集
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="顧客情報の編集">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="顧客名 / 会員名">
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="フリガナ">
              <Input value={form.kana} onChange={(e) => set({ kana: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="担当者（先方）">
              <Input value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} />
            </Field>
            <Field label="メールアドレス">
              <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="電話番号">
              <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="郵便番号">
              <Input value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} />
            </Field>
            <Field label="社内担当者">
              <Input value={form.assignee} onChange={(e) => set({ assignee: e.target.value })} />
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
            <Field label="状態">
              <Select
                value={form.status}
                onChange={(e) => set({ status: e.target.value as CustomerStatus })}
              >
                <option value="active">稼働中</option>
                <option value="inactive">休止</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="獲得代理店" hint="代理店の売上・支払集計に反映されます">
              <Select
                value={form.agencyId}
                onChange={(e) => set({ agencyId: e.target.value, agencyMemberId: "" })}
              >
                <option value="">（直販 / なし）</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="担当営業マン">
              <Select
                value={form.agencyMemberId}
                onChange={(e) => set({ agencyMemberId: e.target.value })}
                disabled={!form.agencyId}
              >
                <option value="">（未設定）</option>
                {membersOfAgency.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="メモ"
            hint="特別待遇にした理由・紹介経緯・注意事項などを記録できます（顧客一覧にも表示）"
          >
            <Textarea
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="例）〇〇様のご紹介のため月額を個別価格に。2026年7月〜"
              className="min-h-[90px]"
            />
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
