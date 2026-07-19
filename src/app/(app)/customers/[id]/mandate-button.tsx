"use client";

import { Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { upsertMandateAction } from "@/app/actions/customers";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { mandateStatusLabels } from "@/lib/domain/constants";
import type { AccountType, DirectDebitMandate, MandateStatus } from "@/lib/domain/types";

/**
 * 口座振替(マンデート)の登録・更新ダイアログ。
 * 口座振替用紙の回収 → NSS(収納代行)への登録完了をツール上に反映し、
 * 引き落としバッチの対象・判定に使われる。
 */
export function MandateButton({
  customerId,
  mandate,
}: {
  customerId: string;
  mandate: DirectDebitMandate | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    bankName: mandate?.bankName ?? "",
    branchName: mandate?.branchName ?? "",
    branchCode: mandate?.branchCode ?? "",
    accountType: (mandate?.accountType ?? "普通") as AccountType,
    accountNumber: mandate?.accountNumber ?? "",
    accountHolderKana: mandate?.accountHolderKana ?? "",
    status: (mandate?.status ?? "pending") as MandateStatus,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await upsertMandateAction(customerId, form);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "登録に失敗しました");
      }
    });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Landmark className="h-4 w-4" />
        {mandate ? "口座情報を更新" : "口座振替を登録"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="口座振替の登録"
        description="回収した口座振替用紙の内容を登録します。収納代行(NSS)側への登録が完了したらステータスを「有効」にしてください。"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="銀行名">
              <Input value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} placeholder="○○銀行" />
            </Field>
            <Field label="支店名">
              <Input value={form.branchName} onChange={(e) => set({ branchName: e.target.value })} placeholder="○○支店" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="支店コード">
              <Input value={form.branchCode} onChange={(e) => set({ branchCode: e.target.value })} placeholder="001" />
            </Field>
            <Field label="種別">
              <Select
                value={form.accountType}
                onChange={(e) => set({ accountType: e.target.value as AccountType })}
              >
                <option value="普通">普通</option>
                <option value="当座">当座</option>
              </Select>
            </Field>
            <Field label="口座番号">
              <Input value={form.accountNumber} onChange={(e) => set({ accountNumber: e.target.value })} placeholder="1234567" />
            </Field>
          </div>
          <Field label="口座名義（カナ）" hint="口座番号等は収納代行側で自動取込されるため、名義人の確認・入力を正確に行ってください">
            <Input
              value={form.accountHolderKana}
              onChange={(e) => set({ accountHolderKana: e.target.value })}
              placeholder="ヤマダ ハナコ"
            />
          </Field>
          <Field label="ステータス" hint="「有効」の口座のみ引き落としバッチで処理されます">
            <Select value={form.status} onChange={(e) => set({ status: e.target.value as MandateStatus })}>
              {(Object.keys(mandateStatusLabels) as MandateStatus[]).map((s) => (
                <option key={s} value={s}>
                  {mandateStatusLabels[s]}
                </option>
              ))}
            </Select>
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={submit} disabled={pending}>
              保存する
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
