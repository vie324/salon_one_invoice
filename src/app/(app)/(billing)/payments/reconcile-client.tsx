"use client";

import { Check, FileUp, Link2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { importBankCsvAction, matchBankTransactionAction } from "@/app/actions/payments";
import { DeleteRecordButton } from "@/components/records/delete-record-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select, Textarea } from "@/components/ui/input";
import { formatDate, formatJPY } from "@/lib/utils";

export interface TxnRow {
  id: string;
  transactionDate: string;
  amount: number;
  payerName: string;
  description: string;
  suggestedInvoiceId: string | null;
  suggestionReason: string | null;
}

export interface OpenInvoiceOption {
  id: string;
  label: string;
}

export function ReconcileClient({
  unmatched,
  openInvoices,
}: {
  unmatched: TxnRow[];
  openInvoices: OpenInvoiceOption[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [importOpen, setImportOpen] = React.useState(false);
  const [csv, setCsv] = React.useState("");
  const [flash, setFlash] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(unmatched.map((t) => [t.id, t.suggestedInvoiceId ?? ""])),
  );

  const match = (txnId: string) => {
    const invoiceId = selected[txnId];
    if (!invoiceId) return;
    start(async () => {
      const res = await matchBankTransactionAction(txnId, invoiceId);
      if (!res.ok) setFlash(res.error ?? "消込に失敗しました");
      router.refresh();
    });
  };

  const doImport = () =>
    start(async () => {
      const res = await importBankCsvAction(csv);
      if (res.ok) {
        setFlash(`${res.count}件の入金明細を取り込みました。`);
        setImportOpen(false);
        setCsv("");
      } else setFlash(res.error ?? "取込に失敗しました");
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          未消込の入金 <span className="font-semibold text-foreground">{unmatched.length}件</span>
        </p>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <FileUp className="h-4 w-4" />
          銀行明細CSVを取込
        </Button>
      </div>

      {flash && (
        <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">{flash}</p>
      )}

      {unmatched.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          未消込の入金はありません。すべて照合済みです。
        </p>
      ) : (
        <ul className="space-y-2">
          {unmatched.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="tabular font-semibold">{formatJPY(t.amount)}</span>
                  <span className="truncate text-sm text-muted-foreground">{t.payerName}</span>
                  {t.suggestedInvoiceId && (
                    <Badge tone="info">
                      <Sparkles className="mr-0.5 h-3 w-3" />
                      候補あり
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(t.transactionDate)} ・ {t.description}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={selected[t.id] ?? ""}
                  onChange={(e) => setSelected((s) => ({ ...s, [t.id]: e.target.value }))}
                  className="h-9 sm:w-64"
                >
                  <option value="">請求書を選択…</option>
                  {openInvoices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  onClick={() => match(t.id)}
                  disabled={pending || !selected[t.id]}
                >
                  <Link2 className="h-4 w-4" />
                  消込
                </Button>
                <DeleteRecordButton
                  entity="bank_transaction"
                  id={t.id}
                  label={`${t.payerName} ${formatJPY(t.amount)}（${formatDate(t.transactionDate)}）`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="銀行明細CSVの取込"
        description="日付・入金額・振込人名義・摘要 の列を含むCSVを貼り付けてください。"
      >
        <div className="space-y-4">
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={8}
            placeholder={"日付,入金額,振込人,摘要\n2026-07-05,22000,ヤマダ ハナコ,振込\n2026-07-06,13200,カ)ビューティラボ,振込"}
            className="font-mono text-xs"
          />
          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5" />
            取込後、金額・名義から自動で消込候補を提案します。
          </div>
          <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={doImport} disabled={pending || !csv.trim()}>
              取り込む
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
