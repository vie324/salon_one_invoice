"use client";

import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { updateOrganizationAction } from "@/app/actions/organization";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import type { AccountType, Organization } from "@/lib/domain/types";

type FormState = {
  name: string;
  postalCode: string;
  address: string;
  tel: string;
  email: string;
  registrationNumber: string;
  bankName: string;
  bankBranch: string;
  bankBranchCode: string;
  bankAccountType: AccountType;
  bankAccountNumber: string;
  bankAccountHolder: string;
  invoicePrefix: string;
  defaultTaxRate: string;
};

const toForm = (org: Organization): FormState => ({
  name: org.name,
  postalCode: org.postalCode,
  address: org.address,
  tel: org.tel,
  email: org.email,
  registrationNumber: org.registrationNumber,
  bankName: org.bankName,
  bankBranch: org.bankBranch,
  bankBranchCode: org.bankBranchCode,
  bankAccountType: org.bankAccountType,
  bankAccountNumber: org.bankAccountNumber,
  bankAccountHolder: org.bankAccountHolder,
  invoicePrefix: org.invoicePrefix,
  defaultTaxRate: String(Math.round(org.defaultTaxRate * 100)),
});

/**
 * 自社情報(請求書の発行元)の編集フォーム。管理者のみ表示する。
 * ここで入力した電話番号・インボイス登録番号・振込先が、
 * 請求書(画面・印刷)と請求書メール・代理店明細にそのまま記載される。
 */
export function OrganizationForm({ org }: { org: Organization }) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(() => toForm(org));
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setMessage(null);
  };

  const save = () =>
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const res = await updateOrganizationAction({
        name: form.name,
        postalCode: form.postalCode,
        address: form.address,
        tel: form.tel,
        email: form.email,
        registrationNumber: form.registrationNumber,
        bankName: form.bankName,
        bankBranch: form.bankBranch,
        bankBranchCode: form.bankBranchCode,
        bankAccountType: form.bankAccountType,
        bankAccountNumber: form.bankAccountNumber,
        bankAccountHolder: form.bankAccountHolder,
        invoicePrefix: form.invoicePrefix,
        defaultTaxRate: Number(form.defaultTaxRate) / 100,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("保存しました。請求書の記載に反映されます。");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="事業者名" className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="郵便番号">
          <Input
            value={form.postalCode}
            onChange={(e) => set({ postalCode: e.target.value })}
            placeholder="144-0052"
          />
        </Field>
        <Field label="電話番号">
          <Input
            value={form.tel}
            onChange={(e) => set({ tel: e.target.value })}
            placeholder="03-1234-5678"
          />
        </Field>
        <Field label="住所" className="sm:col-span-2">
          <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label="メールアドレス">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set({ email: e.target.value })}
            placeholder="billing@example.jp"
          />
        </Field>
        <Field
          label="登録番号（インボイス）"
          hint="適格請求書に必要です。T＋数字13桁で入力してください。"
        >
          <Input
            value={form.registrationNumber}
            onChange={(e) => set({ registrationNumber: e.target.value })}
            placeholder="T2010801037576"
          />
        </Field>
      </div>

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-sm font-medium">
          振込先（支払方法が「銀行振込」の請求書に記載されます）
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="銀行名">
            <Input
              value={form.bankName}
              onChange={(e) => set({ bankName: e.target.value })}
              placeholder="住信SBIネット銀行"
            />
          </Field>
          <Field label="支店名">
            <Input
              value={form.bankBranch}
              onChange={(e) => set({ bankBranch: e.target.value })}
              placeholder="法人第一支店"
            />
          </Field>
          <Field label="支店番号">
            <Input
              value={form.bankBranchCode}
              onChange={(e) => set({ bankBranchCode: e.target.value })}
              placeholder="106"
            />
          </Field>
          <Field label="預金種別">
            <Select
              value={form.bankAccountType}
              onChange={(e) => set({ bankAccountType: e.target.value as AccountType })}
            >
              <option value="普通">普通</option>
              <option value="当座">当座</option>
            </Select>
          </Field>
          <Field label="口座番号">
            <Input
              value={form.bankAccountNumber}
              onChange={(e) => set({ bankAccountNumber: e.target.value })}
              placeholder="3182919"
            />
          </Field>
          <Field label="口座名義">
            <Input
              value={form.bankAccountHolder}
              onChange={(e) => set({ bankAccountHolder: e.target.value })}
              placeholder="サロンワン"
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <Field label="請求書番号 接頭辞" hint="例: INV → INV-202608-0003">
          <Input
            value={form.invoicePrefix}
            onChange={(e) => set({ invoicePrefix: e.target.value })}
          />
        </Field>
        <Field label="既定税率（%）" hint="明細を追加したときの初期値">
          <Input
            type="number"
            min={0}
            max={100}
            value={form.defaultTaxRate}
            onChange={(e) => set({ defaultTaxRate: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "保存中…" : "自社情報を保存"}
        </Button>
        {message && <span className="text-sm text-success">{message}</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}
