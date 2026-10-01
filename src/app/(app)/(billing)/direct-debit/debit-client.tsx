"use client";

import { ArrowRightLeft, ListPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createBatchAction, switchInvoicesToTransferAction } from "@/app/actions/direct-debit";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { formatJPY } from "@/lib/utils";

/** ② NSS登録用の一覧を作る(引き落とせる請求をまとめる) */
export function CreateBatchButton({
  defaultDate,
  invoiceIds,
  count,
  amount,
}: {
  defaultDate: string;
  invoiceIds: string[];
  count: number;
  amount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(defaultDate);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createBatchAction(date, invoiceIds);
      if (!res.ok) {
        setError(res.error ?? "作成に失敗しました");
        return;
      }
      setOpen(false);
      router.push(`/direct-debit/${res.id}`);
    });

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={count === 0}>
        <ListPlus className="h-4 w-4" />
        NSS登録用の一覧を作る（{count}件）
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="NSS登録用の一覧を作る"
        description={`引き落とせる請求 ${count}件（${formatJPY(amount)}）をまとめます。作成後、CSV（確認用）を見ながら NSS の収納サイトへ金額を登録してください。`}
      >
        <div className="space-y-4">
          <Field label="引き落とし日" hint="NSS の引き落とし日（収納リンクの記載）に合わせます。">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={submit} disabled={pending || !date}>
              {pending ? "作成中…" : "一覧を作る"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** NSS で引き落とせない請求を振込に切り替える */
export function SwitchToTransferButton({
  invoiceIds,
  label,
}: {
  invoiceIds: string[];
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(null);
  const run = () => {
    if (
      !window.confirm(
        `${invoiceIds.length}件の請求を「銀行振込」に切り替えます。請求書の案内文もお振込先に変わります。切り替えたら請求書を送付してください。よろしいですか？`,
      )
    ) {
      return;
    }
    start(async () => {
      const res = await switchInvoicesToTransferAction(invoiceIds);
      setMessage(res.ok ? `${res.count}件を振込に切り替えました。請求書の画面から送付してください。` : res.error);
      router.refresh();
    });
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={run} disabled={pending || invoiceIds.length === 0}>
        <ArrowRightLeft className="h-4 w-4" />
        {label ?? `振込に切り替える（${invoiceIds.length}件）`}
      </Button>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </span>
  );
}
