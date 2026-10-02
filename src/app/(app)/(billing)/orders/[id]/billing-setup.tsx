"use client";

import { AlertTriangle, CalendarClock, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { setupBillingAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import {
  billingDateInMonth,
  prorateMonthly,
  subscriptionMonthly,
  taxAmount,
} from "@/lib/domain/calculations";
import { paymentMethodLabels } from "@/lib/domain/constants";
import type { InitialInvoiceMode } from "@/lib/domain/onboarding";
import { defaultFirstBillingMonth, planDisplayName } from "@/lib/domain/pricing";
import type { PaymentMethod, Plan } from "@/lib/domain/types";
import type { BillingSetupInput } from "@/lib/orders/billing-setup";
import { cn, currentMonth, formatJPY } from "@/lib/utils";
import { announceOrderResult } from "./order-actions";

/** 「請求を開始」ダイアログに渡す、案件の状態(サーバーで組み立てる) */
export interface BillingSetupContext {
  customerId: string;
  customerName: string;
  /** 選べるプラン(有効なもの) */
  plans: Plan[];
  initialMode: InitialInvoiceMode;
  /** このシステムの初回請求書(区分「初期費用」)が無く、今回決められる */
  canSetInitial: boolean;
  /** 登録済みの毎月の請求(定期契約)。無ければ null */
  subscription: { label: string; monthly: number; taxRate: number } | null;
  /** 初回請求書にできる請求書(この案件の、定期請求で作られたもの・取消を除く) */
  candidates: { id: string; invoiceNumber: string; issueDate: string; total: number; statusLabel: string }[];
  paymentMethod: PaymentMethod;
  /** 紹介特典の対象(初月日割り無料・2ヶ月無料) */
  referred: boolean;
  emailReady: boolean;
  customerEmail: string;
  /** 利用開始日の初期値 */
  defaultStartDate: string;
}

type Focus = "all" | "initial" | "subscription";
type InitialChoice = "keep" | "create" | "existing" | "outside" | "none";
type SubChoice = "keep" | "create" | "none";

const PAYMENT_METHODS: PaymentMethod[] = ["direct_debit", "bank_transfer", "credit_card", "cash"];

/**
 * 請求を開始する(システムに締結済みの契約書が無いお客様)。
 * 旧「顧客ステータス」で手で進めていた過去のお客様や、書面・口頭で契約したお客様の
 * 初回請求書と毎月の請求(定期契約)を1つの画面で設定する。
 */
export function BillingSetupButton({
  ctx,
  focus,
  label,
  variant = "outline",
}: {
  ctx: BillingSetupContext;
  focus: Focus;
  label: string;
  variant?: "primary" | "outline" | "ghost";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // 開いた場所に関係の無い、決まっている項目は出さない
  // (「定期契約を登録」から開いたら、初回請求書はまだ決まっていないときだけ出す)
  const showInitial = ctx.canSetInitial && (focus !== "subscription" || ctx.initialMode === "undecided");
  const showSubscription = ctx.subscription == null && focus !== "initial";

  const [startedOn, setStartedOn] = React.useState(ctx.defaultStartDate);
  // 初回請求書
  const [initialChoice, setInitialChoice] = React.useState<InitialChoice>("create");
  const [initialFee, setInitialFee] = React.useState("");
  const [feeTouched, setFeeTouched] = React.useState(false);
  const [includeProration, setIncludeProration] = React.useState(true);
  const [prorationTouched, setProrationTouched] = React.useState(false);
  const [emailInvoice, setEmailInvoice] = React.useState(false);
  const [invoiceId, setInvoiceId] = React.useState("");
  const [outsideSent, setOutsideSent] = React.useState(true);
  const [outsidePaid, setOutsidePaid] = React.useState(false);
  // 毎月の請求
  const [subChoice, setSubChoice] = React.useState<SubChoice>("create");
  const [planId, setPlanId] = React.useState(ctx.plans[0]?.id ?? "");
  const [optionKeys, setOptionKeys] = React.useState<string[]>([]);
  const [storeCount, setStoreCount] = React.useState(1);
  const [priceOverride, setPriceOverride] = React.useState("");
  const [firstMonth, setFirstMonth] = React.useState("");
  const [monthTouched, setMonthTouched] = React.useState(false);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(ctx.paymentMethod);

  const plan = ctx.plans.find((p) => p.id === planId) ?? null;

  const reset = () => {
    setError(null);
    setStartedOn(ctx.defaultStartDate);
    setInitialChoice(initialDefault(ctx, focus));
    const firstPlan = ctx.plans[0] ?? null;
    setPlanId(firstPlan?.id ?? "");
    setInitialFee(firstPlan ? String(firstPlan.initialFee) : "0");
    setFeeTouched(false);
    // 利用開始が先月以前(過去のお客様)なら、初月日割りは通常システムの外で請求済み
    setIncludeProration(ctx.defaultStartDate.slice(0, 7) >= currentMonth());
    setProrationTouched(false);
    setEmailInvoice(ctx.emailReady && Boolean(ctx.customerEmail));
    setInvoiceId(ctx.candidates[0]?.id ?? "");
    setOutsideSent(true);
    setOutsidePaid(false);
    setSubChoice(showSubscription ? "create" : "keep");
    setOptionKeys([]);
    setStoreCount(1);
    setPriceOverride("");
    setFirstMonth(defaultFirstBillingMonth(ctx.defaultStartDate, ctx.referred));
    setMonthTouched(false);
    setPaymentMethod(ctx.paymentMethod);
  };

  const onPlanChange = (id: string) => {
    setPlanId(id);
    const p = ctx.plans.find((x) => x.id === id);
    setOptionKeys((keys) => (p ? keys.filter((k) => p.options.some((o) => o.key === k)) : []));
    if (p && !feeTouched) setInitialFee(String(p.initialFee));
  };

  const onStartChange = (value: string) => {
    setStartedOn(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    if (!monthTouched) setFirstMonth(defaultFirstBillingMonth(value, ctx.referred));
    if (!prorationTouched) setIncludeProration(value.slice(0, 7) >= currentMonth());
  };

  /* ---- 見込み ---- */
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startedOn);
  const override = priceOverride.trim() === "" ? null : Math.max(0, Math.round(Number(priceOverride) || 0));
  const newMonthly =
    subChoice === "create" && plan ? subscriptionMonthly(plan, optionKeys, override, storeCount) : null;
  const monthlyBase =
    newMonthly != null && plan
      ? { amount: newMonthly, taxRate: plan.taxRate }
      : ctx.subscription
        ? { amount: ctx.subscription.monthly, taxRate: ctx.subscription.taxRate }
        : null;
  const proration =
    initialChoice === "create" && includeProration && monthlyBase && validStart
      ? prorateMonthly(monthlyBase.amount, startedOn)
      : null;
  const fee = Math.max(0, Math.round(Number(initialFee) || 0));
  const feeTaxRate = monthlyBase?.taxRate ?? plan?.taxRate ?? 0.1;
  const prorationCharged = ctx.referred ? 0 : (proration?.amount ?? 0);
  const initialTotal =
    fee + taxAmount(fee, feeTaxRate) + prorationCharged + taxAmount(prorationCharged, monthlyBase?.taxRate ?? 0.1);
  const firstBillingDate =
    subChoice === "create" && plan && /^\d{4}-\d{2}$/.test(firstMonth)
      ? billingDateInMonth(firstMonth, plan.billingDay || 27)
      : null;
  const firstMonthIsPast = /^\d{4}-\d{2}$/.test(firstMonth) && firstMonth <= currentMonth();

  const nothingChosen = initialChoice === "keep" && subChoice === "keep";
  const invalid =
    nothingChosen ||
    (initialChoice === "existing" && !invoiceId) ||
    (subChoice === "create" && (!plan || !/^\d{4}-\d{2}$/.test(firstMonth))) ||
    ((initialChoice === "create" || subChoice === "create") && !validStart);

  const submit = () =>
    start(async () => {
      setError(null);
      const input: BillingSetupInput = {
        startedOn,
        initial:
          initialChoice === "create"
            ? { mode: "create", initialFee: fee, includeProration, emailInvoice }
            : initialChoice === "existing"
              ? { mode: "existing", invoiceId }
              : initialChoice === "outside"
                ? { mode: "outside", sent: outsideSent, paid: outsidePaid }
                : initialChoice === "none"
                  ? { mode: "none" }
                  : { mode: "keep" },
        subscription:
          subChoice === "create"
            ? {
                mode: "create",
                planId,
                optionKeys,
                storeCount,
                priceOverride: override,
                firstBillingMonth: firstMonth,
                paymentMethod,
              }
            : subChoice === "none"
              ? { mode: "none" }
              : { mode: "keep" },
      };
      const res = await setupBillingAction(ctx.customerId, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      announceOrderResult(
        "請求を設定しました",
        res.emailResult ? `${res.detail} / ${res.emailResult}` : res.detail,
      );
      router.refresh();
    });

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {focus === "subscription" ? <CalendarClock className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`請求の設定 — ${ctx.customerName}`}
        description="システムに契約書が無いお客様（旧「顧客ステータス」で管理していた過去のお客様、書面・口頭で契約したお客様など）の、初回請求書と毎月の請求を設定します。"
        className="max-w-xl"
      >
        <div className="space-y-5">
          {(initialChoice === "create" || subChoice === "create") && (
            <Field
              label="利用開始日"
              hint="初月日割り（この日〜月末）と、定期契約の開始日に使います。過去のお客様は実際の利用開始日を入れてください。"
            >
              <Input type="date" value={startedOn} onChange={(e) => onStartChange(e.target.value)} />
            </Field>
          )}

          {/* 初回請求書 */}
          {showInitial && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">初回請求書（初期費用＋初月日割り）</h3>
              <div className="grid gap-2">
                <Choice
                  active={initialChoice === "create"}
                  onClick={() => setInitialChoice("create")}
                  title="このシステムで作成する（銀行振込）"
                  body="初期費用と初月日割りの請求書を作ります。入金はこのシステムで確認できます。"
                />
                <Choice
                  active={initialChoice === "existing"}
                  onClick={() => setInitialChoice("existing")}
                  disabled={ctx.candidates.length === 0}
                  title="作成済みの請求書を初回請求書にする"
                  body={
                    ctx.candidates.length === 0
                      ? "このお客様の請求書がありません。"
                      : "請求書の画面で「都度」として作った請求書を、初回請求書として扱います。"
                  }
                />
                <Choice
                  active={initialChoice === "outside"}
                  onClick={() => setInitialChoice("outside")}
                  title="システムの外で発行済み（スプレッドシート・紙など）"
                  body="発行と送付、入金の確認を、受注管理のチェックで記録します。"
                />
                <Choice
                  active={initialChoice === "none"}
                  onClick={() => setInitialChoice("none")}
                  title="初回請求なし"
                  body="初期費用・初月日割りがないお客様です。"
                />
                {focus !== "initial" && (
                  <Choice
                    active={initialChoice === "keep"}
                    onClick={() => setInitialChoice("keep")}
                    title="あとで決める"
                    body="受注管理の対応待ちに「初回請求書を用意」として残ります。"
                  />
                )}
              </div>

              {initialChoice === "create" && (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <Field label="初期費用（税抜）" hint="選んだプランの初期費用が入っています。個別価格なら書き換えてください。0円も可。">
                    <Input
                      type="number"
                      min={0}
                      value={initialFee}
                      onChange={(e) => {
                        setInitialFee(e.target.value);
                        setFeeTouched(true);
                      }}
                    />
                  </Field>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={includeProration}
                      disabled={!monthlyBase}
                      onChange={(e) => {
                        setIncludeProration(e.target.checked);
                        setProrationTouched(true);
                      }}
                    />
                    <span>
                      初月日割りを含める
                      <span className="block text-xs text-muted-foreground">
                        {!monthlyBase
                          ? "毎月の請求（定期契約）を登録すると計算できます。"
                          : proration
                            ? `${proration.label}：${formatJPY(proration.amount)}（税抜）${ctx.referred ? "※ご紹介特典で無料" : ""}`
                            : "利用開始日〜月末を日割りで請求します。利用開始が先月以前なら、通常は不要です。"}
                      </span>
                    </span>
                  </label>
                  <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">初回請求書の合計（税込）</span>
                    <span className="tabular font-semibold">{formatJPY(initialTotal)}</span>
                  </div>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={emailInvoice}
                      disabled={!ctx.emailReady || !ctx.customerEmail}
                      onChange={(e) => setEmailInvoice(e.target.checked)}
                    />
                    <span>
                      そのままメールで送る
                      <span className="block text-xs text-muted-foreground">
                        {!ctx.emailReady
                          ? "メール送信が未設定のため送れません（郵送・手渡ししたら、案件ページで「完了にする」）"
                          : !ctx.customerEmail
                            ? "お客様のメールアドレスが未登録です"
                            : `送付先: ${ctx.customerEmail}`}
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {initialChoice === "existing" && ctx.candidates.length > 0 && (
                <div className="rounded-md border border-border p-3">
                  <Field label="初回請求書にする請求書">
                    <Select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
                      {ctx.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.invoiceNumber}・{c.issueDate.replace(/-/g, "/")} 発行・{formatJPY(c.total)}・{c.statusLabel}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <p className="mt-2 text-xs text-muted-foreground">
                    区分が「初期費用」に変わり、入金の状況が受注管理に反映されます。
                  </p>
                </div>
              )}

              {initialChoice === "outside" && (
                <div className="space-y-2 rounded-md border border-border p-3 text-sm">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={outsideSent}
                      onChange={(e) => setOutsideSent(e.target.checked)}
                    />
                    お客様へ送付済み
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={outsidePaid}
                      onChange={(e) => setOutsidePaid(e.target.checked)}
                    />
                    入金も確認済み
                  </label>
                  {!outsidePaid && (
                    <p className="text-xs text-muted-foreground">
                      入金を確認したら、案件ページの「入金を確認済みにする」で記録します（対応待ちに残ります）。
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 毎月の請求 */}
          {showSubscription ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">毎月の請求（定期契約）</h3>
              <div className="grid gap-2">
                <Choice
                  active={subChoice === "create"}
                  onClick={() => setSubChoice("create")}
                  title="登録する"
                  body="毎月1日に請求書が自動で作られ、27日に引き落とし（口座振替の場合）。"
                />
                {focus !== "subscription" && (
                  <Choice
                    active={subChoice === "keep"}
                    onClick={() => setSubChoice("keep")}
                    title="あとで登録する"
                    body="受注管理の対応待ちに「毎月の請求（定期契約）を登録」として残ります。"
                  />
                )}
                <Choice
                  active={subChoice === "none"}
                  onClick={() => setSubChoice("none")}
                  title="このシステムでは毎月の請求をしない"
                  body="スポット契約のお客様や、システムの外で請求を続けるお客様です。"
                />
              </div>

              {subChoice === "create" && (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <Field label="プラン">
                    <Select value={planId} onChange={(e) => onPlanChange(e.target.value)}>
                      {ctx.plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {planDisplayName(p)} 月 {formatJPY(p.amount)}（1店舗）
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {plan && plan.options.length > 0 && (
                    <Field label="オプション">
                      <div className="flex flex-wrap gap-2">
                        {plan.options.map((o) => (
                          <label
                            key={o.key}
                            className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[hsl(var(--primary))]"
                              checked={optionKeys.includes(o.key)}
                              onChange={() =>
                                setOptionKeys((keys) =>
                                  keys.includes(o.key) ? keys.filter((k) => k !== o.key) : [...keys, o.key],
                                )
                              }
                            />
                            {o.name}（{formatJPY(o.monthly)}/月）
                          </label>
                        ))}
                      </div>
                    </Field>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="店舗数">
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={storeCount}
                        onChange={(e) => setStoreCount(Math.max(1, Math.round(Number(e.target.value)) || 1))}
                      />
                    </Field>
                    <Field label="月額 基本料金の個別価格（税抜・1店舗）" hint="空欄 = プラン通り">
                      <Input
                        type="number"
                        min={0}
                        value={priceOverride}
                        placeholder={plan ? String(plan.amount) : ""}
                        onChange={(e) => setPriceOverride(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="このシステムで請求を始める月">
                      <Input
                        type="month"
                        value={firstMonth}
                        onChange={(e) => {
                          setFirstMonth(e.target.value);
                          setMonthTouched(true);
                        }}
                      />
                    </Field>
                    <Field label="毎月のお支払い方法">
                      <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m === "direct_debit" ? "口座振替（NSS）" : paymentMethodLabels[m]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  {firstMonthIsPast && (
                    <p className="flex items-start gap-1.5 rounded-md bg-warning/10 px-3 py-2 text-xs text-[hsl(38_92%_32%)] dark:text-warning">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      今月以前を選ぶと、次の自動作成でその月の請求書がすぐ作られます。システムの外で請求済みの月は選ばないでください。
                    </p>
                  )}
                  {newMonthly != null && plan && (
                    <div className="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">
                          毎月の請求{storeCount > 1 ? `（${storeCount}店舗）` : ""}
                        </span>
                        <span className="tabular font-semibold">
                          {formatJPY(newMonthly + taxAmount(newMonthly, plan.taxRate))}（税込）
                        </span>
                      </div>
                      {firstBillingDate && (
                        <p className="text-xs text-muted-foreground">
                          最初の請求: {firstMonth.replace("-", "年")}月分（請求書は{firstMonth.replace("-", "年")}月1日に作成・
                          {firstBillingDate.replace(/-/g, "/")} {paymentMethod === "direct_debit" ? "引き落とし" : "支払期限"}）
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : (
            ctx.subscription && (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                毎月の請求: <span className="font-medium">{ctx.subscription.label}</span>（登録済み。変更は「定期請求」で）
              </p>
            )
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={submit} disabled={pending || invalid}>
              <Rocket className="h-4 w-4" />
              {pending ? "設定中…" : "この内容で設定する"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** 初回請求書の選択肢の初期値(どこから開いたか・いまの扱いに合わせる) */
function initialDefault(ctx: BillingSetupContext, focus: Focus): InitialChoice {
  if (!ctx.canSetInitial || focus === "subscription") return "keep";
  if (ctx.initialMode === "none") return "none";
  if (ctx.initialMode === "outside") {
    return focus === "initial" && ctx.candidates.length > 0 ? "existing" : "outside";
  }
  return "create";
}

function Choice({
  active,
  onClick,
  title,
  body,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50",
      )}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{body}</div>
    </button>
  );
}
