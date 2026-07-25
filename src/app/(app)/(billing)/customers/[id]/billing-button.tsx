"use client";

import { CreditCard, FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  simulateBillingAction,
  startBillingCheckoutAction,
} from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Label, Select } from "@/components/ui/input";
import {
  selectedOptions,
  subscriptionMonthly,
  taxAmount,
} from "@/lib/domain/calculations";
import type { Plan } from "@/lib/domain/types";
import { formatJPY } from "@/lib/utils";

const termLabel = (t: Plan["term"]) => (t === "annual" ? "年間" : "月額");

export function BillingButton({
  customerId,
  stripeConfigured,
  plans,
}: {
  customerId: string;
  stripeConfigured: boolean;
  plans: Plan[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [flash, setFlash] = React.useState<string | null>(null);

  const activePlans = plans.filter((p) => p.active);
  const [planId, setPlanId] = React.useState(activePlans[0]?.id ?? "");
  const [optKeys, setOptKeys] = React.useState<string[]>(
    activePlans[0]?.options.map((o) => o.key) ?? [],
  );

  const plan = activePlans.find((p) => p.id === planId);

  // プラン変更時はオプションを全選択に初期化
  const onPlanChange = (id: string) => {
    setPlanId(id);
    const p = activePlans.find((x) => x.id === id);
    setOptKeys(p?.options.map((o) => o.key) ?? []);
  };

  const toggleOpt = (key: string) =>
    setOptKeys((k) => (k.includes(key) ? k.filter((x) => x !== key) : [...k, key]));

  const taxRate = plan?.taxRate ?? 0.1;
  const monthlyExcl = plan ? subscriptionMonthly(plan, optKeys) : 0;
  const monthlyTax = taxAmount(monthlyExcl, taxRate);
  const monthlyIncl = monthlyExcl + monthlyTax;
  const initialExcl = plan?.initialFee ?? 0;
  const initialIncl = initialExcl + taxAmount(initialExcl, taxRate);
  const planName = plan ? `${plan.name}（${termLabel(plan.term)}）` : "月額プラン";

  // Stripe へは税込で課金する
  const opts = () => ({ planName, monthlyAmount: monthlyIncl, initialFee: initialIncl });

  const checkout = () =>
    start(async () => {
      setFlash(null);
      const res = await startBillingCheckoutAction(customerId, opts());
      if (res.ok && res.url) window.location.href = res.url;
      else setFlash(res.error ?? "開始に失敗しました");
    });

  const simulate = () =>
    start(async () => {
      setFlash(null);
      const res = await simulateBillingAction(customerId, opts());
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setFlash(res.error ?? "シミュレートに失敗しました");
    });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CreditCard className="h-4 w-4" />
        Stripeで課金開始
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Stripe 課金の開始"
        description="プランとオプションを選ぶと、初期費用＋月額を Stripe でまとめて登録します。"
      >
        <div className="space-y-4">
          <Field label="プラン">
            <Select value={planId} onChange={(e) => onPlanChange(e.target.value)}>
              <optgroup label="月額プラン">
                {activePlans.filter((p) => p.term === "monthly").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（基本 {formatJPY(p.amount)}／初期 {formatJPY(p.initialFee)}）
                  </option>
                ))}
              </optgroup>
              <optgroup label="年間プラン">
                {activePlans.filter((p) => p.term === "annual").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（基本 {formatJPY(p.amount)}／初期 {formatJPY(p.initialFee)}）
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>

          {plan && plan.options.length > 0 && (
            <div>
              <Label>オプション</Label>
              <div className="space-y-1.5">
                {plan.options.map((o) => (
                  <label
                    key={o.key}
                    className="flex cursor-pointer items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={optKeys.includes(o.key)}
                        onChange={() => toggleOpt(o.key)}
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                      />
                      {o.name}
                    </span>
                    <span className="tabular text-muted-foreground">+{formatJPY(o.monthly)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1 rounded-md bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
            <div className="flex justify-between">
              <span>基本料金（税抜）</span>
              <span className="tabular">{formatJPY(plan?.amount ?? 0)}</span>
            </div>
            {plan &&
              selectedOptions(plan, optKeys).map((o) => (
                <div key={o.key} className="flex justify-between text-xs">
                  <span>＋{o.name}</span>
                  <span className="tabular">{formatJPY(o.monthly)}</span>
                </div>
              ))}
            <div className="flex justify-between border-t border-border/60 pt-1 text-xs">
              <span>小計（税抜）</span>
              <span className="tabular">{formatJPY(monthlyExcl)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>消費税（{Math.round(taxRate * 100)}%）</span>
              <span className="tabular">{formatJPY(monthlyTax)}</span>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-1 font-semibold">
              <span>月額合計（税込）</span>
              <span className="tabular">{formatJPY(monthlyIncl)}</span>
            </div>
            <div className="flex justify-between pt-1 text-xs">
              <span>初回請求（初期費用 {formatJPY(initialIncl)} ＋ 初月 {formatJPY(monthlyIncl)}・税込）</span>
              <span className="tabular font-semibold">{formatJPY(initialIncl + monthlyIncl)}</span>
            </div>
          </div>

          {flash && <p className="text-sm text-destructive">{flash}</p>}

          <div className="space-y-2 pt-1">
            <Button
              className="w-full"
              onClick={checkout}
              disabled={pending || !stripeConfigured || !plan}
              title={stripeConfigured ? undefined : "STRIPE_SECRET_KEY を設定すると有効になります"}
            >
              <CreditCard className="h-4 w-4" />
              Stripe Checkout へ進む
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={simulate}
              disabled={pending || !plan}
            >
              <FlaskConical className="h-4 w-4" />
              テスト決済をシミュレート（Stripeキー不要）
            </Button>
            {!stripeConfigured && (
              <p className="text-center text-xs text-muted-foreground">
                Stripeキー未設定のため、まずはシミュレートで初期費用＋月額の管理をご確認いただけます。
              </p>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
