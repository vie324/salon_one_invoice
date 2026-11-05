"use client";

import { PencilLine, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { updateInvoiceItemsAction } from "@/app/actions/invoices";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { calcInvoiceTotals } from "@/lib/domain/calculations";
import { TAX_RATE_OPTIONS } from "@/lib/domain/constants";
import type { InvoiceItem, InvoiceType } from "@/lib/domain/types";
import { formatJPY } from "@/lib/utils";

type Row = { description: string; quantity: number; unitPrice: number; taxRate: number };

/**
 * 請求書の明細の修正(入金前・NSS引き落としの一覧に入っていない請求書だけ)。
 * 修正できない請求書は、ボタンを押せない理由を出す。
 */
export function EditInvoiceItemsButton({
  invoiceId,
  invoiceNumber,
  type,
  items,
  notes,
  blockedReason,
}: {
  invoiceId: string;
  invoiceNumber: string;
  type: InvoiceType;
  items: InvoiceItem[];
  notes: string;
  /** 修正できない理由(修正できるなら null) */
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [memo, setMemo] = React.useState(notes);
  const [done, setDone] = React.useState<string[] | null>(null);

  const openDialog = () => {
    setRows(items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate })));
    setMemo(notes);
    setError(null);
    setOpen(true);
  };

  const preview = calcInvoiceTotals(
    rows
      .filter((r) => r.description.trim())
      .map((r, i) => ({
        id: String(i),
        description: r.description,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        taxRate: r.taxRate,
        amount: Math.round(r.quantity * r.unitPrice),
      })),
  );
  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = () =>
    start(async () => {
      setError(null);
      const res = await updateInvoiceItemsAction(invoiceId, { items: rows, notes: memo });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setDone(res.notes);
      router.refresh();
    });

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={openDialog}
        disabled={blockedReason != null}
        title={blockedReason ?? undefined}
      >
        <PencilLine className="h-4 w-4" />
        明細を修正
      </Button>
      {blockedReason && <p className="text-[11px] text-muted-foreground">{blockedReason}</p>}
      {done && (
        <div className="rounded-md bg-success/10 px-3 py-2 text-xs text-foreground">
          明細を修正しました。お客様へは「PDFを保存」で作り直した請求書をお送りください。
          {done.map((n) => (
            <div key={n} className="mt-1">
              ・{n}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`明細を修正 — ${invoiceNumber}`}
        description="金額は税抜で入力します。請求書番号・発行日・ステータスは変わりません。"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {type === "initial" && (
            <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
              初期費用は1店舗あたりの金額です。複数店舗のお客様は、初期構築費用の<strong>数量に店舗数</strong>を入れてください。
              直した初期費用に合わせて、未払いの代理店報酬・紹介謝礼も計算し直します。
            </p>
          )}

          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_4.5rem_7rem_6.5rem_2rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
              <span>品目</span>
              <span>数量</span>
              <span>単価（税抜）</span>
              <span>税率</span>
              <span />
            </div>
            {rows.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_2.5rem] gap-2 border-b border-border/60 pb-2 sm:grid-cols-[1fr_4.5rem_7rem_6.5rem_2rem] sm:border-0 sm:pb-0"
              >
                <Input
                  value={row.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder="品目"
                  aria-label="品目"
                  className="col-span-3 sm:col-span-1"
                />
                <Input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                  aria-label="数量"
                />
                <Input
                  type="number"
                  min={0}
                  value={row.unitPrice}
                  onChange={(e) => update(i, { unitPrice: Number(e.target.value) })}
                  aria-label="単価"
                />
                <Select
                  value={row.taxRate}
                  onChange={(e) => update(i, { taxRate: Number(e.target.value) })}
                  aria-label="税率"
                  className="hidden sm:flex"
                >
                  {TAX_RATE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  disabled={rows.length === 1}
                  className="flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30"
                  aria-label="行を削除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRows((rs) => [...rs, { description: "", quantity: 1, unitPrice: 0, taxRate: 0.1 }])}
            >
              <Plus className="h-3.5 w-3.5" />
              行を追加
            </Button>
          </div>

          <div className="space-y-1 rounded-md bg-muted/50 px-3 py-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">小計（税抜）</span>
              <span className="tabular">{formatJPY(preview.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">消費税</span>
              <span className="tabular">{formatJPY(preview.taxTotal)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>合計（税込）</span>
              <span className="tabular">{formatJPY(preview.total)}</span>
            </div>
          </div>

          <Field label="備考">
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={save} disabled={pending}>
              保存
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
