"use client";

import { Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createInvoiceAction } from "@/app/actions/invoices";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/input";
import { calcInvoiceTotals, computeDueDate } from "@/lib/domain/calculations";
import { invoiceTypeLabels, paymentMethodLabels, TAX_RATE_OPTIONS } from "@/lib/domain/constants";
import type {
  Customer,
  InvoiceItem,
  InvoiceType,
  PaymentMethod,
  Plan,
} from "@/lib/domain/types";
import { formatJPY, toISODate } from "@/lib/utils";

type Row = { description: string; quantity: number; unitPrice: number; taxRate: number };

const emptyRow = (taxRate: number): Row => ({ description: "", quantity: 1, unitPrice: 0, taxRate });

export function InvoiceForm({
  customers,
  plans,
  defaultTaxRate,
  defaultCustomerId,
}: {
  customers: Customer[];
  plans: Plan[];
  defaultTaxRate: number;
  defaultCustomerId?: string;
}) {
  const router = useRouter();
  const today = toISODate(new Date());
  const initialCustomer =
    defaultCustomerId && customers.some((c) => c.id === defaultCustomerId)
      ? defaultCustomerId
      : customers[0]?.id ?? "";
  const [customerId, setCustomerId] = React.useState(initialCustomer);
  const [type, setType] = React.useState<InvoiceType>("one_time");
  const [planId, setPlanId] = React.useState<string>("");
  const [issueDate, setIssueDate] = React.useState(today);
  const [dueDate, setDueDate] = React.useState(computeDueDate(today));
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(
    customers.find((c) => c.id === initialCustomer)?.paymentMethod ?? "direct_debit",
  );
  const [rows, setRows] = React.useState<Row[]>([emptyRow(defaultTaxRate)]);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const customer = customers.find((c) => c.id === customerId);

  // 顧客変更 → 支払方法を追従
  React.useEffect(() => {
    if (customer) setPaymentMethod(customer.paymentMethod);
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // プラン選択 → 明細を差し替え
  const applyPlan = (id: string) => {
    setPlanId(id);
    const plan = plans.find((p) => p.id === id);
    if (plan) {
      const period = issueDate.slice(0, 7);
      setRows([{ description: `${plan.name}（${period}）`, quantity: 1, unitPrice: plan.amount, taxRate: plan.taxRate }]);
    }
  };

  const items: InvoiceItem[] = rows.map((r, i) => ({
    id: String(i),
    description: r.description,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    taxRate: r.taxRate,
    amount: Math.round(r.quantity * r.unitPrice),
  }));
  const totals = calcInvoiceTotals(items);

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow(defaultTaxRate)]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const submit = (status: "draft" | "sent") => {
    setError(null);
    if (!customerId) return setError("顧客を選択してください。");
    const validRows = rows.filter((r) => r.description.trim() && r.quantity > 0);
    if (validRows.length === 0) return setError("明細を1行以上入力してください。");

    startTransition(async () => {
      const res = await createInvoiceAction({
        customerId,
        type,
        issueDate,
        dueDate,
        paymentMethod,
        billingPeriod: type === "recurring" ? issueDate.slice(0, 7) : null,
        items: validRows,
        notes,
        status: status === "sent" ? (paymentMethod === "direct_debit" ? "awaiting_payment" : "sent") : "draft",
      });
      if (res.ok) router.push(`/invoices/${res.id}`);
      else setError(res.error ?? "作成に失敗しました。");
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="顧客" className="sm:col-span-2">
              <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（{c.code}）
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="区分">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as InvoiceType)}
              >
                {(Object.keys(invoiceTypeLabels) as InvoiceType[]).map((t) => (
                  <option key={t} value={t}>
                    {invoiceTypeLabels[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="支払方法">
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {paymentMethodLabels[m]}
                  </option>
                ))}
              </Select>
            </Field>
            {type === "recurring" && plans.length > 0 && (
              <Field label="プランから明細を作成" className="sm:col-span-2">
                <Select value={planId} onChange={(e) => applyPlan(e.target.value)}>
                  <option value="">選択してください</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{formatJPY(p.amount)}）
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="発行日">
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
            <Field label="支払期限">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>明細</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4" />
              行を追加
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-12 items-end gap-2">
                <div className="col-span-12 sm:col-span-5">
                  {i === 0 && <Label>品目</Label>}
                  <Input
                    value={row.description}
                    onChange={(e) => updateRow(i, { description: e.target.value })}
                    placeholder="施術・商品名など"
                  />
                </div>
                <div className="col-span-3 sm:col-span-1">
                  {i === 0 && <Label>数量</Label>}
                  <Input
                    type="number"
                    min={0}
                    value={row.quantity}
                    onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-5 sm:col-span-2">
                  {i === 0 && <Label>単価</Label>}
                  <Input
                    type="number"
                    min={0}
                    value={row.unitPrice}
                    onChange={(e) => updateRow(i, { unitPrice: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  {i === 0 && <Label>税率</Label>}
                  <Select
                    value={row.taxRate}
                    onChange={(e) => updateRow(i, { taxRate: Number(e.target.value) })}
                  >
                    {TAX_RATE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-1 flex items-center justify-end">
                  <span className="tabular hidden text-sm sm:block">{formatJPY(items[i].amount)}</span>
                </div>
                <div className="col-span-12 flex justify-end sm:col-span-1 sm:justify-center">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                    aria-label="行を削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>備考</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="お支払い方法のご案内など"
            />
          </CardContent>
        </Card>
      </div>

      {/* 集計サイドバー */}
      <div>
        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle>合計</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="小計" value={formatJPY(totals.subtotal)} />
            {totals.taxBreakdown.map((b) => (
              <Row
                key={b.rate}
                label={`消費税（${Math.round(b.rate * 100)}%）`}
                value={formatJPY(b.tax)}
                muted
              />
            ))}
            <div className="border-t border-border pt-3">
              <Row label="合計（税込）" value={formatJPY(totals.total)} big />
            </div>
            {customer && (
              <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                {customer.name} 様は
                <strong> {paymentMethodLabels[paymentMethod]}</strong>
                でのお支払いです。
                {paymentMethod === "direct_debit" && "送付後は口座振替バッチに含められます。"}
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                className="w-full"
                onClick={() => submit("sent")}
                disabled={pending}
              >
                <Send className="h-4 w-4" />
                作成して送付
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => submit("draft")}
                disabled={pending}
              >
                下書き保存
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  big,
  muted,
}: {
  label: string;
  value: string;
  big?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span className={`tabular ${big ? "text-xl font-bold" : "font-medium"}`}>{value}</span>
    </div>
  );
}
