"use client";

import { Megaphone, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { deleteMarketingServiceAction, saveMarketingServiceAction } from "@/app/actions/marketing";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  MARKETING_DEFAULTS,
  MARKETING_SPECIAL_INITIAL_FEE,
  MARKETING_STATUSES,
  marketingBreakEvenAdSpend,
  marketingStatusLabels,
} from "@/lib/domain/marketing";
import type { MarketingService, MarketingServiceStatus } from "@/lib/domain/types";
import { cn, formatJPY, toJstDateKey } from "@/lib/utils";

const initialFeePresets = [
  { label: "通常料金", value: MARKETING_DEFAULTS.initialFee },
  { label: "特別プラン料金", value: MARKETING_SPECIAL_INITIAL_FEE },
  { label: "なし", value: 0 },
];

/**
 * マーケティング代行の登録・変更。
 * 金額の初期値は契約書の料金表【マーケティング代行費用】(通常料金)。
 * 月額は広告費で毎月変わるので、ここでは条件(最低額・料率)だけを記録する。
 */
export function MarketingServiceButton({
  customerId,
  customerName,
  service,
  size = "sm",
  className,
}: {
  customerId: string;
  customerName: string;
  service: MarketingService | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        className={className}
      >
        {service ? <Pencil className="h-3.5 w-3.5" /> : <Megaphone className="h-4 w-4" />}
        {service ? "内容を変更" : "マーケティング代行を登録"}
      </Button>
      <MarketingServiceDialog
        open={open}
        onClose={() => setOpen(false)}
        customerId={customerId}
        customerName={customerName}
        service={service}
      />
    </>
  );
}

function MarketingServiceDialog({
  open,
  onClose,
  customerId,
  customerName,
  service,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  service: MarketingService | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [status, setStatus] = React.useState<MarketingServiceStatus>("planned");
  const [appliedOn, setAppliedOn] = React.useState("");
  const [startedOn, setStartedOn] = React.useState("");
  const [endedOn, setEndedOn] = React.useState("");
  const [initialFee, setInitialFee] = React.useState<number>(MARKETING_DEFAULTS.initialFee);
  const [monthlyMinimum, setMonthlyMinimum] = React.useState<number>(MARKETING_DEFAULTS.monthlyMinimum);
  const [ratePercent, setRatePercent] = React.useState<number>(MARKETING_DEFAULTS.feeRate * 100);
  const [note, setNote] = React.useState("");

  // 開くたびに今の記録(無ければ通常料金)から始める
  React.useEffect(() => {
    if (!open) return;
    setStatus(service?.status ?? "planned");
    setAppliedOn(service?.appliedOn ?? toJstDateKey(new Date().toISOString()));
    setStartedOn(service?.startedOn ?? "");
    setEndedOn(service?.endedOn ?? "");
    setInitialFee(service?.initialFee ?? MARKETING_DEFAULTS.initialFee);
    setMonthlyMinimum(service?.monthlyMinimum ?? MARKETING_DEFAULTS.monthlyMinimum);
    setRatePercent(Math.round((service?.feeRate ?? MARKETING_DEFAULTS.feeRate) * 1000) / 10);
    setNote(service?.note ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const feeRate = Number.isFinite(ratePercent) ? ratePercent / 100 : 0;
  const breakEven = marketingBreakEvenAdSpend({ monthlyMinimum, feeRate });

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await saveMarketingServiceAction(customerId, {
        status,
        appliedOn: appliedOn || null,
        startedOn: startedOn || null,
        endedOn: status === "stopped" ? endedOn || null : null,
        initialFee,
        monthlyMinimum,
        feeRate,
        note,
      });
      if (res.ok) {
        onClose();
        router.refresh();
      } else setError(res.error ?? "保存に失敗しました");
    });
  };

  const remove = () => {
    if (!window.confirm(`${customerName} 様のマーケティング代行の登録を取り消します。よろしいですか？（やめた場合は「停止」にしてください）`)) return;
    setError(null);
    start(async () => {
      const res = await deleteMarketingServiceAction(customerId);
      if (res.ok) {
        onClose();
        router.refresh();
      } else setError(res.error ?? "取り消しに失敗しました");
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={service ? "マーケティング代行の内容を変更" : "マーケティング代行を登録"}
      description={`${customerName} 様。金額は税抜です。初期値は契約書の料金表（通常料金）です。`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="状態">
            <Select value={status} onChange={(e) => setStatus(e.target.value as MarketingServiceStatus)}>
              {MARKETING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {marketingStatusLabels[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="申込日">
            <Input type="date" value={appliedOn} onChange={(e) => setAppliedOn(e.target.value)} />
          </Field>
          <Field label="運用の開始日" hint={status === "planned" ? "決まっていれば入力" : undefined}>
            <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
          </Field>
          {status === "stopped" && (
            <Field label="停止日">
              <Input type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} />
            </Field>
          )}
        </div>

        <div>
          <Field label="初期構築費用（税抜）">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={initialFee}
              onChange={(e) => setInitialFee(Number(e.target.value))}
            />
          </Field>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {initialFeePresets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setInitialFee(p.value)}
                aria-pressed={initialFee === p.value}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-xs transition-colors",
                  initialFee === p.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {p.label} <span className="tabular ml-1">{formatJPY(p.value)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="月額運用費の最低額（税抜）">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={monthlyMinimum}
              onChange={(e) => setMonthlyMinimum(Number(e.target.value))}
            />
          </Field>
          <Field label="広告費に対する料率（%）">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={1}
              value={ratePercent}
              onChange={(e) => setRatePercent(Number(e.target.value))}
            />
          </Field>
        </div>

        <div className="rounded-md bg-secondary px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground">
          毎月の運用費は <strong className="tabular">{formatJPY(monthlyMinimum)}</strong>
          {breakEven != null ? (
            <>
              。広告費が <strong className="tabular">{formatJPY(breakEven)}</strong> を超える月は、広告費の
              <strong className="tabular">{Math.round(feeRate * 1000) / 10}%</strong>（こちらのほうが高くなります）。
            </>
          ) : (
            "（固定額）。"
          )}
          広告費そのものは別にお客様へ請求します。請求書は自動では作らないので、広告費が確定したら請求書の画面で作成してください。
        </div>

        <Field label="メモ（任意）">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="運用する媒体（Meta広告・HPB など）、広告予算の目安など"
          />
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {service ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="h-9 text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-50"
            >
              間違えて登録した場合：登録を取り消す
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={submit} disabled={pending}>
              {service ? "保存" : "登録する"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
