import { NextResponse } from "next/server";
import { getServiceRepository } from "@/lib/data";
import { paymentMethodLabels, paymentStatusLabels } from "@/lib/domain/constants";
import type { PaymentMethod } from "@/lib/domain/types";
import { isMonthKey, toISODate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function csvField(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const matchedByLabels: Record<string, string> = {
  manual: "手動",
  csv: "銀行明細CSV",
  auto: "自動(引き落とし)",
};

/**
 * 入金一覧のCSVエクスポート。
 * クエリ: month=YYYY-MM で対象月に絞り込み(省略時は全件)。
 * 認証は middleware のゲートを通る(スタッフ専用)。Excel向けにBOM付きUTF-8。
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  const repo = await getServiceRepository();
  const [payments, customers, invoices] = await Promise.all([
    repo.listPayments(),
    repo.listCustomers(),
    repo.listInvoices(),
  ]);

  const list = isMonthKey(month)
    ? payments.filter((p) => p.paidAt.startsWith(month))
    : payments;

  const header = [
    "入金日",
    "顧客コード",
    "顧客名",
    "金額",
    "入金方法",
    "ステータス",
    "摘要",
    "消込方法",
    "請求書番号",
    "メモ",
  ];
  const rows = list.map((p) => {
    const customer = customers.find((c) => c.id === p.customerId);
    const invoice = p.invoiceId ? invoices.find((i) => i.id === p.invoiceId) : null;
    return [
      p.paidAt,
      customer?.code ?? "",
      customer?.name ?? "",
      p.amount,
      p.method === "adjustment"
        ? "調整"
        : (paymentMethodLabels[p.method as PaymentMethod] ?? p.method),
      paymentStatusLabels[p.status],
      p.reference,
      matchedByLabels[p.matchedBy] ?? p.matchedBy,
      invoice?.invoiceNumber ?? "",
      p.memo,
    ];
  });

  // Excel が文字化けしないよう BOM 付き UTF-8 で出力する
  const csv =
    "\uFEFF" +
    [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") +
    "\r\n";

  const suffix = isMonthKey(month) ? month : toISODate(new Date());
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${suffix}.csv"`,
    },
  });
}
