import { NextResponse } from "next/server";
import { getServiceRepository } from "@/lib/data";
import { outstandingAmount } from "@/lib/domain/calculations";
import {
  invoiceStatusLabels,
  invoiceTypeLabels,
  paymentMethodLabels,
} from "@/lib/domain/constants";
import type { InvoiceStatus, InvoiceType, PaymentMethod } from "@/lib/domain/types";
import { toISODate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** CSVのフィールドエスケープ(カンマ・改行・引用符を含む値をクオート) */
function csvField(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 請求書一覧のCSVエクスポート(会計ソフト・Excel連携用)。
 * クエリ: status / type / q (一覧画面の絞り込みと同じ)。
 * 認証は middleware のゲートを通る(スタッフ専用)。Excel向けにBOM付きUTF-8。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const repo = await getServiceRepository();
  const invoices = await repo.listInvoices({
    status: (url.searchParams.get("status") as InvoiceStatus | null) ?? "all",
    type: (url.searchParams.get("type") as InvoiceType | null) ?? "all",
    search: url.searchParams.get("q") ?? undefined,
  });

  const header = [
    "請求書番号",
    "顧客コード",
    "顧客名",
    "種別",
    "ステータス",
    "発行日",
    "支払期限",
    "対象月",
    "支払方法",
    "小計(税抜)",
    "消費税",
    "合計(税込)",
    "入金済",
    "未収残高",
    "入金日",
    "督促回数",
    "最終督促日",
    "備考",
  ];
  const rows = invoices.map((i) => [
    i.invoiceNumber,
    i.customer?.code ?? "",
    i.customer?.name ?? "",
    invoiceTypeLabels[i.type],
    invoiceStatusLabels[i.status],
    i.issueDate,
    i.dueDate,
    i.billingPeriod ?? "",
    paymentMethodLabels[i.paymentMethod as PaymentMethod] ?? i.paymentMethod,
    i.subtotal,
    i.taxTotal,
    i.total,
    i.amountPaid,
    outstandingAmount(i),
    i.paidAt ?? "",
    i.reminderCount ?? 0,
    i.lastReminderAt ? i.lastReminderAt.slice(0, 10) : "",
    i.notes,
  ]);

  // Excel が文字化けしないよう BOM 付き UTF-8 で出力する
  const csv =
    "\uFEFF" +
    [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") +
    "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoices-${toISODate(new Date())}.csv"`,
    },
  });
}
