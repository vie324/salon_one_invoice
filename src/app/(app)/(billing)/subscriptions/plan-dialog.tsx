"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createPlanAction, updatePlanAction } from "@/app/actions/subscriptions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Label, Select } from "@/components/ui/input";
import { TAX_RATE_OPTIONS } from "@/lib/domain/constants";
import type { Plan, PlanOption, PlanTerm } from "@/lib/domain/types";
import { formatJPY, genId } from "@/lib/utils";

type OptionRow = { key: string; name: string; monthly: number };

export function PlanFormDialog({
  open,
  onClose,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  plan?: Plan;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(plan?.name ?? "");
  const [term, setTerm] = React.useState<PlanTerm>(plan?.term ?? "monthly");
  const [amount, setAmount] = React.useState(plan?.amount ?? 30000);
  const [initialFee, setInitialFee] = React.useState(plan?.initialFee ?? 200000);
  const [taxRate, setTaxRate] = React.useState(plan?.taxRate ?? 0.1);
  const [billingDay, setBillingDay] = React.useState(plan?.billingDay ?? 27);
  const [options, setOptions] = React.useState<OptionRow[]>(
    plan?.options.map((o) => ({ ...o })) ?? [],
  );

  // ダイアログを開き直したときに初期値を反映
  React.useEffect(() => {
    if (!open) return;
    setName(plan?.name ?? "");
    setTerm(plan?.term ?? "monthly");
    setAmount(plan?.amount ?? 30000);
    setInitialFee(plan?.initialFee ?? 200000);
    setTaxRate(plan?.taxRate ?? 0.1);
    setBillingDay(plan?.billingDay ?? 27);
    setOptions(plan?.options.map((o) => ({ ...o })) ?? []);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addOption = () =>
    setOptions((o) => [...o, { key: genId("opt"), name: "", monthly: 0 }]);
  const updateOption = (i: number, patch: Partial<OptionRow>) =>
    setOptions((o) => o.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeOption = (i: number) => setOptions((o) => o.filter((_, idx) => idx !== i));

  const submit = () => {
    setError(null);
    if (!name.trim()) return setError("プラン名を入力してください。");
    const cleanOptions: PlanOption[] = options
      .filter((o) => o.name.trim())
      .map((o) => ({ key: o.key || genId("opt"), name: o.name.trim(), monthly: o.monthly }));

    const input = {
      name,
      description: plan?.description ?? "",
      amount,
      taxRate,
      billingDay,
      initialFee,
      term,
      options: cleanOptions,
    };
    start(async () => {
      const res = plan
        ? await updatePlanAction(plan.id, input)
        : await createPlanAction(input);
      if (res.ok) {
        onClose();
        router.refresh();
      } else setError(res.error ?? "保存に失敗しました。");
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={plan ? "プランを編集" : "新規プラン"}
      description="基本料金・初期費用・オプションを設定します。金額は税抜で入力してください。"
    >
      <div className="space-y-4">
        <Field label="プラン名">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="定価 / まとめパック 等" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="契約区分">
            <Select value={term} onChange={(e) => setTerm(e.target.value as PlanTerm)}>
              <option value="monthly">月額</option>
              <option value="annual">年間</option>
            </Select>
          </Field>
          <Field label="消費税">
            <Select value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}>
              {TAX_RATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="初期費用（税抜）">
            <Input type="number" value={initialFee} onChange={(e) => setInitialFee(Number(e.target.value))} />
          </Field>
          <Field label="基本料金 月額（税抜）">
            <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">オプション（税抜）</Label>
            <Button type="button" variant="outline" size="sm" onClick={addOption}>
              <Plus className="h-3.5 w-3.5" />
              追加
            </Button>
          </div>
          {options.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
              オプションはありません。「追加」で HPB・ミニモ連携 / LINE連携 などを設定できます。
            </p>
          ) : (
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={o.key} className="flex items-center gap-2">
                  <Input
                    value={o.name}
                    onChange={(e) => updateOption(i, { name: e.target.value })}
                    placeholder="オプション名（例: HPB・ミニモ連携）"
                    className="flex-1"
                  />
                  <div className="relative w-32">
                    <Input
                      type="number"
                      value={o.monthly}
                      onChange={(e) => updateOption(i, { monthly: Number(e.target.value) })}
                      className="pr-8"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      /月
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          フル導入時（基本＋全オプション）:{" "}
          <strong className="tabular">
            {formatJPY(amount + options.reduce((s, o) => s + (o.monthly || 0), 0))}
          </strong>
          （税抜）/ 月
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {plan ? "保存" : "プランを作成"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** 既存プランの編集ボタン(プランカードに配置) */
export function PlanEditButton({ plan }: { plan: Plan }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      >
        <Pencil className="h-3.5 w-3.5" />
        編集
      </button>
      <PlanFormDialog open={open} onClose={() => setOpen(false)} plan={plan} />
    </>
  );
}

/** 新規プラン作成ボタン */
export function NewPlanButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        新規プラン
      </Button>
      <PlanFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
