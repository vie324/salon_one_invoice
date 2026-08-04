"use client";

import { Pause, Pencil, Play, Plus, RefreshCw, X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as React from "react";
import {
  createSubscriptionAction,
  updateSubscriptionAction,
  updateSubscriptionStatusAction,
} from "@/app/actions/subscriptions";
import { runRecurringBillingAction } from "@/app/actions/invoices";
import { SubscriptionStatusBadge } from "@/components/status-badge";
import { DeleteRecordButton } from "@/components/records/delete-record-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Customer, Plan, PlanOption, Subscription } from "@/lib/domain/types";
import { formatDate, formatJPY, toISODate } from "@/lib/utils";
import { NewPlanButton } from "./plan-dialog";

interface Row extends Subscription {
  customerName: string;
  planName: string;
  planAmount: number;
  planOptions: PlanOption[];
  monthlyTotal: number;
  monthlyInclTotal: number;
}

export function SubscriptionsClient({
  rows,
  customers,
  plans,
}: {
  rows: Row[];
  customers: Customer[];
  plans: Plan[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [flash, setFlash] = React.useState<string | null>(null);
  const [subOpen, setSubOpen] = React.useState(false);

  const changeStatus = (id: string, status: Subscription["status"]) =>
    start(async () => {
      await updateSubscriptionStatusAction(id, status);
      router.refresh();
    });

  const runBilling = () =>
    start(async () => {
      const res = await runRecurringBillingAction();
      setFlash(
        res.ok
          ? res.count > 0
            ? `${res.count}件の請求書を生成しました。`
            : "生成対象の定期請求はありませんでした。"
          : res.error ?? "生成に失敗しました。",
      );
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={runBilling} disabled={pending}>
          <Zap className="h-4 w-4" />
          定期請求を今すぐ生成
        </Button>
        <Button variant="outline" onClick={() => setSubOpen(true)}>
          <Plus className="h-4 w-4" />
          新規契約
        </Button>
        <NewPlanButton />
        {flash && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
            {flash}
          </span>
        )}
      </div>

      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>顧客</TH>
            <TH>プラン</TH>
            <TH className="text-right">月額合計（税抜／税込）</TH>
            <TH>次回請求日</TH>
            <TH>状態</TH>
            <TH className="text-right">操作</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD>
                <Link href={`/customers/${r.customerId}`} className="font-medium hover:text-primary hover:underline">
                  {r.customerName}
                </Link>
              </TD>
              <TD className="text-muted-foreground">
                {r.planName}
                {r.optionKeys.length > 0 && (
                  <span className="ml-1 text-xs">＋オプション{r.optionKeys.length}</span>
                )}
                {r.priceOverride != null && (
                  <Badge tone="primary" className="ml-1.5">
                    個別価格
                  </Badge>
                )}
              </TD>
              <TD className="text-right">
                <div className="tabular font-medium">{formatJPY(r.monthlyTotal)}</div>
                <div className="tabular text-xs text-muted-foreground">
                  税込 {formatJPY(r.monthlyInclTotal)}
                </div>
              </TD>
              <TD className="text-muted-foreground">{formatDate(r.nextBillingDate)}</TD>
              <TD>
                <SubscriptionStatusBadge status={r.status} />
              </TD>
              <TD>
                <div className="flex justify-end gap-1">
                  <DeleteRecordButton
                    entity="subscription"
                    id={r.id}
                    label={`${r.customerName} の定期契約（${r.planName}）`}
                  />
                  {r.status !== "canceled" && (
                    <EditSubscriptionButton row={r} pending={pending} />
                  )}
                  {r.status === "active" && (
                    <IconBtn title="停止" onClick={() => changeStatus(r.id, "paused")} disabled={pending}>
                      <Pause className="h-4 w-4" />
                    </IconBtn>
                  )}
                  {r.status === "paused" && (
                    <IconBtn title="再開" onClick={() => changeStatus(r.id, "active")} disabled={pending}>
                      <Play className="h-4 w-4" />
                    </IconBtn>
                  )}
                  {r.status !== "canceled" && (
                    <IconBtn title="解約" onClick={() => changeStatus(r.id, "canceled")} disabled={pending}>
                      <X className="h-4 w-4" />
                    </IconBtn>
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <NewSubscriptionDialog
        open={subOpen}
        onClose={() => setSubOpen(false)}
        customers={customers}
        plans={plans.filter((p) => p.active)}
        pending={pending}
        onSubmit={(input) =>
          start(async () => {
            await createSubscriptionAction(input);
            setSubOpen(false);
            router.refresh();
          })
        }
      />
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** 既存契約の変更(個別価格・オプション)ダイアログ */
function EditSubscriptionButton({ row, pending }: { row: Row; pending: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [saving, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [override, setOverride] = React.useState<string>(
    row.priceOverride != null ? String(row.priceOverride) : "",
  );
  const [optKeys, setOptKeys] = React.useState<string[]>(row.optionKeys);

  const toggle = (k: string) =>
    setOptKeys((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await updateSubscriptionAction(row.id, {
        priceOverride: override === "" ? null : Number(override),
        optionKeys: optKeys,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error ?? "保存に失敗しました");
    });

  return (
    <>
      <IconBtn title="契約内容を変更（個別価格）" onClick={() => setOpen(true)} disabled={pending}>
        <Pencil className="h-4 w-4" />
      </IconBtn>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`契約内容の変更 — ${row.customerName}`}
        description="変更内容は次回の請求書生成から反映されます。"
      >
        <div className="space-y-4">
          <Field
            label={`基本料金の個別価格（税抜） — プラン定価 ${formatJPY(row.planAmount)}`}
            hint="特別待遇・紹介割引など。空欄にするとプラン定価に戻ります。"
          >
            <Input
              type="number"
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder={String(row.planAmount)}
            />
          </Field>
          {row.planOptions.length > 0 && (
            <div>
              <Label>オプション</Label>
              <div className="space-y-1.5">
                {row.planOptions.map((o) => (
                  <label
                    key={o.key}
                    className="flex cursor-pointer items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={optKeys.includes(o.key)}
                        onChange={() => toggle(o.key)}
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
          <div className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
            変更後の月額（税抜）:{" "}
            <strong className="tabular">
              {formatJPY(
                (override === "" ? row.planAmount : Number(override) || 0) +
                  row.planOptions
                    .filter((o) => optKeys.includes(o.key))
                    .reduce((s, o) => s + o.monthly, 0),
              )}
            </strong>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              キャンセル
            </Button>
            <Button onClick={submit} disabled={saving}>
              保存する
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function NewSubscriptionDialog({
  open,
  onClose,
  customers,
  plans,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  plans: Plan[];
  onSubmit: (input: {
    customerId: string;
    planId: string;
    startedOn: string;
    optionKeys: string[];
    priceOverride: number | null;
  }) => void;
  pending: boolean;
}) {
  const [customerId, setCustomerId] = React.useState(customers[0]?.id ?? "");
  const [planId, setPlanId] = React.useState(plans[0]?.id ?? "");
  const [optKeys, setOptKeys] = React.useState<string[]>(plans[0]?.options.map((o) => o.key) ?? []);
  const [startedOn, setStartedOn] = React.useState(toISODate(new Date()));
  const [override, setOverride] = React.useState<string>("");

  const plan = plans.find((p) => p.id === planId);
  const onPlan = (id: string) => {
    setPlanId(id);
    setOptKeys(plans.find((p) => p.id === id)?.options.map((o) => o.key) ?? []);
  };
  const toggle = (k: string) =>
    setOptKeys((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  return (
    <Dialog open={open} onClose={onClose} title="新規定期契約">
      <div className="space-y-4">
        <Field label="顧客">
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（{c.code}）
              </option>
            ))}
          </Select>
        </Field>
        <Field label="プラン">
          <Select value={planId} onChange={(e) => onPlan(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.term === "annual" ? "年間" : "月額"}・基本 {formatJPY(p.amount)}）
              </option>
            ))}
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
                      onChange={() => toggle(o.key)}
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="契約開始日">
            <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
          </Field>
          <Field label="個別価格（税抜・任意）" hint="特別待遇・紹介割引など。空欄で定価">
            <Input
              type="number"
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder={plan ? String(plan.amount) : ""}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                customerId,
                planId,
                startedOn,
                optionKeys: optKeys,
                priceOverride: override === "" ? null : Number(override),
              })
            }
            disabled={pending || !customerId || !planId}
          >
            契約を作成
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
