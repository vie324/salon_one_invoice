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
import { Field, Input } from "@/components/ui/input";
import { formatJPY } from "@/lib/utils";

export function BillingButton({
  customerId,
  stripeConfigured,
  defaultPlanName,
  defaultMonthly,
}: {
  customerId: string;
  stripeConfigured: boolean;
  defaultPlanName: string;
  defaultMonthly: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [flash, setFlash] = React.useState<string | null>(null);
  const [planName, setPlanName] = React.useState(defaultPlanName);
  const [monthly, setMonthly] = React.useState(defaultMonthly || 12000);
  const [initialFee, setInitialFee] = React.useState(100000);

  const opts = () => ({ planName, monthlyAmount: monthly, initialFee });

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
        description="初期費用（単発）＋ 月額（サブスク）を Stripe でまとめて登録します。"
      >
        <div className="space-y-4">
          <Field label="プラン名">
            <Input value={planName} onChange={(e) => setPlanName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="初期費用（税込）" hint="単発・初回請求に加算">
              <Input
                type="number"
                value={initialFee}
                onChange={(e) => setInitialFee(Number(e.target.value))}
              />
            </Field>
            <Field label="月額（税込）" hint="毎月自動課金">
              <Input
                type="number"
                value={monthly}
                onChange={(e) => setMonthly(Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="rounded-md bg-secondary px-3 py-2.5 text-sm text-secondary-foreground">
            初回請求: <strong className="tabular">{formatJPY(initialFee + monthly)}</strong>
            <span className="text-xs">（初期費用 {formatJPY(initialFee)} ＋ 初月 {formatJPY(monthly)}）</span>
            <br />
            <span className="text-xs">2ヶ月目以降: 毎月 {formatJPY(monthly)}</span>
          </div>

          {flash && <p className="text-sm text-destructive">{flash}</p>}

          <div className="space-y-2 pt-1">
            <Button
              className="w-full"
              onClick={checkout}
              disabled={pending || !stripeConfigured}
              title={stripeConfigured ? undefined : "STRIPE_SECRET_KEY を設定すると有効になります"}
            >
              <CreditCard className="h-4 w-4" />
              Stripe Checkout へ進む
            </Button>
            <Button variant="outline" className="w-full" onClick={simulate} disabled={pending}>
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
