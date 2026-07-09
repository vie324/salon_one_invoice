"use client";

import { Pause, Play, Plus, RefreshCw, X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as React from "react";
import {
  createPlanAction,
  createSubscriptionAction,
  updateSubscriptionStatusAction,
} from "@/app/actions/subscriptions";
import { runRecurringBillingAction } from "@/app/actions/invoices";
import { SubscriptionStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Customer, Plan, Subscription } from "@/lib/domain/types";
import { formatDate, formatJPY, toISODate } from "@/lib/utils";

interface Row extends Subscription {
  customerName: string;
  planName: string;
  planAmount: number;
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
  const [planOpen, setPlanOpen] = React.useState(false);

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
        <Button variant="outline" onClick={() => setPlanOpen(true)}>
          <Plus className="h-4 w-4" />
          新規プラン
        </Button>
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
            <TH className="text-right">月額(税抜)</TH>
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
              <TD className="text-muted-foreground">{r.planName}</TD>
              <TD className="tabular text-right">{formatJPY(r.planAmount)}</TD>
              <TD className="text-muted-foreground">{formatDate(r.nextBillingDate)}</TD>
              <TD>
                <SubscriptionStatusBadge status={r.status} />
              </TD>
              <TD>
                <div className="flex justify-end gap-1">
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
        plans={plans}
        pending={pending}
        onSubmit={(input) =>
          start(async () => {
            await createSubscriptionAction(input);
            setSubOpen(false);
            router.refresh();
          })
        }
      />
      <NewPlanDialog
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        pending={pending}
        onSubmit={(input) =>
          start(async () => {
            await createPlanAction(input);
            setPlanOpen(false);
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
  onSubmit: (input: { customerId: string; planId: string; startedOn: string }) => void;
  pending: boolean;
}) {
  const [customerId, setCustomerId] = React.useState(customers[0]?.id ?? "");
  const [planId, setPlanId] = React.useState(plans[0]?.id ?? "");
  const [startedOn, setStartedOn] = React.useState(toISODate(new Date()));
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
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{formatJPY(p.amount)}/月）
              </option>
            ))}
          </Select>
        </Field>
        <Field label="契約開始日">
          <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button
            onClick={() => onSubmit({ customerId, planId, startedOn })}
            disabled={pending || !customerId || !planId}
          >
            契約を作成
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function NewPlanDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    description: string;
    amount: number;
    taxRate: number;
    billingDay: number;
  }) => void;
  pending: boolean;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState(10000);
  const [billingDay, setBillingDay] = React.useState(27);
  return (
    <Dialog open={open} onClose={onClose} title="新規プラン">
      <div className="space-y-4">
        <Field label="プラン名">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="スタンダード会員" />
        </Field>
        <Field label="説明">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="月額(税抜)">
            <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
          <Field label="請求日(毎月)">
            <Input
              type="number"
              min={1}
              max={28}
              value={billingDay}
              onChange={(e) => setBillingDay(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button
            onClick={() => onSubmit({ name, description, amount, taxRate: 0.1, billingDay })}
            disabled={pending || !name.trim()}
          >
            プランを作成
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
