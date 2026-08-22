"use client";

import { Ban, BellRing, CheckCircle2, Printer, Send, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  sendInvoiceAction,
  sendPaymentReminderAction,
  updateInvoiceStatusAction,
} from "@/app/actions/invoices";
import { recordPaymentAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { paymentMethodLabels } from "@/lib/domain/constants";
import type { PaymentMethod } from "@/lib/domain/types";
import { formatJPY, toISODate } from "@/lib/utils";

export function InvoiceActions({
  id,
  customerId,
  status,
  total,
  amountPaid,
  paymentMethod,
  hasEmail,
  reminderCount = 0,
}: {
  id: string;
  customerId: string;
  status: string;
  total: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  hasEmail: boolean;
  reminderCount?: number;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [payOpen, setPayOpen] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);
  const outstanding = Math.max(0, total - amountPaid);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; emailResult?: string | null }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setFlash(res.error ?? "処理に失敗しました");
      else if (res.emailResult) setFlash(res.emailResult);
      router.refresh();
    });

  const isPaid = status === "paid" || status === "canceled";

  return (
    <div className="space-y-2">
      {status === "draft" && (
        <>
          <Button
            className="w-full"
            disabled={pending}
            onClick={() => run(() => sendInvoiceAction(id, { email: hasEmail }))}
          >
            <Send className="h-4 w-4" />
            {hasEmail ? "送付（メール送信）" : "送付済にする"}
          </Button>
        </>
      )}

      {!isPaid && (
        <Button
          variant={status === "draft" ? "outline" : "primary"}
          className="w-full"
          disabled={pending}
          onClick={() => setPayOpen(true)}
        >
          <Wallet className="h-4 w-4" />
          入金を記録
        </Button>
      )}

      {!isPaid && outstanding > 0 && (
        <Button
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={() =>
            run(() => updateInvoiceStatusAction(id, "paid"))
          }
        >
          <CheckCircle2 className="h-4 w-4" />
          全額入金済にする
        </Button>
      )}

      {!isPaid && status !== "draft" && outstanding > 0 && (
        <Button
          variant="outline"
          className="w-full"
          disabled={pending || !hasEmail}
          title={hasEmail ? undefined : "顧客のメールアドレスが未登録です"}
          onClick={() => {
            if (
              !window.confirm(
                `お支払いのご確認(督促)メールを送信します。よろしいですか？${reminderCount > 0 ? `\n（これまでに${reminderCount}回送信済み）` : ""}`,
              )
            )
              return;
            run(() => sendPaymentReminderAction(id));
          }}
        >
          <BellRing className="h-4 w-4" />
          督促メールを送信{reminderCount > 0 ? `（${reminderCount}回送信済）` : ""}
        </Button>
      )}

      <a
        href={`/print/invoices/${id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-input bg-card text-sm font-medium hover:bg-muted"
      >
        <Printer className="h-4 w-4" />
        印刷 / PDF
      </a>

      {!isPaid && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          disabled={pending}
          onClick={() => run(() => updateInvoiceStatusAction(id, "canceled"))}
        >
          <Ban className="h-4 w-4" />
          取消
        </Button>
      )}

      {flash && (
        <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">{flash}</p>
      )}

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        defaultAmount={outstanding}
        defaultMethod={paymentMethod}
        onSubmit={(input) =>
          run(async () => {
            const res = await recordPaymentAction({
              invoiceId: id,
              customerId,
              ...input,
            });
            if (res.ok) setPayOpen(false);
            return res;
          })
        }
        pending={pending}
      />
    </div>
  );
}

function PaymentDialog({
  open,
  onClose,
  defaultAmount,
  defaultMethod,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  defaultAmount: number;
  defaultMethod: PaymentMethod;
  onSubmit: (input: {
    amount: number;
    method: PaymentMethod | "adjustment";
    paidAt: string;
    reference: string;
  }) => void;
  pending: boolean;
}) {
  const [amount, setAmount] = React.useState(defaultAmount);
  const [method, setMethod] = React.useState<PaymentMethod | "adjustment">(defaultMethod);
  const [paidAt, setPaidAt] = React.useState(toISODate(new Date()));
  const [reference, setReference] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setAmount(defaultAmount);
      setMethod(defaultMethod);
    }
  }, [open, defaultAmount, defaultMethod]);

  return (
    <Dialog open={open} onClose={onClose} title="入金の記録" description={`未収額 ${formatJPY(defaultAmount)}`}>
      <div className="space-y-4">
        <Field label="入金額">
          <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="入金方法">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {(Object.keys(paymentMethodLabels) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {paymentMethodLabels[m]}
                </option>
              ))}
              <option value="adjustment">調整</option>
            </Select>
          </Field>
          <Field label="入金日">
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
        </div>
        <Field label="摘要（振込人名義など）">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="任意" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button
            onClick={() => onSubmit({ amount, method, paidAt, reference })}
            disabled={pending || amount <= 0}
          >
            入金を記録
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
