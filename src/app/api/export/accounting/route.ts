import { NextResponse } from "next/server";
import { forbiddenUnless } from "@/lib/access";
import { loadRevenueLedger } from "@/lib/accounting/load";
import { getServiceRepository } from "@/lib/data";
import { canViewAccounting, invoiceStatusLabels } from "@/lib/domain/constants";
import { revenueKindLabels } from "@/lib/domain/revenue";

export const dynamic = "force-dynamic";

/** CSVのフィールドエスケープ(カンマ・改行・引用符を含む値をクオート) */
function csvField(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 売上台帳の CSV(会計ソフト・Excel 用)。
 * クエリ: fy = 決算の年 / kind = lines(売上の明細) | payouts(代理店報酬・紹介謝礼)。
 * 請求管理の担当者と税理士さん(閲覧のみ)が使える。Excel 向けに BOM 付き UTF-8。
 */
export async function GET(req: Request) {
  const denied = await forbiddenUnless(canViewAccounting);
  if (denied) return denied;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "payouts" ? "payouts" : "lines";
  const repo = await getServiceRepository();
  const { ledger } = await loadRevenueLedger(repo, url.searchParams.get("fy"));
  const fy = ledger.fiscalYear;

  const rows: (string | number | null)[][] =
    kind === "lines"
      ? [
          ["計上月", "顧客コード", "お客様", "請求書番号", "発行日", "区分", "品目", "税率", "税抜", "消費税", "税込", "請求書の状態", "入金日"],
          ...ledger.lines.map((l) => [
            l.month,
            l.customerCode,
            l.customerName,
            l.invoiceNumber,
            l.issueDate,
            revenueKindLabels[l.kind],
            l.description,
            `${Math.round(l.taxRate * 100)}%`,
            l.amount,
            l.tax,
            l.total,
            l.paid ? "入金済" : invoiceStatusLabels[l.status],
            l.paidDate,
          ]),
        ]
      : [
          ["計上月", "区分", "支払先", "対象のお客様", "内容", "金額", "支払日"],
          ...ledger.payouts.map((p) => [
            p.month,
            p.kind === "agency" ? "代理店報酬" : "紹介謝礼",
            p.payee,
            p.customerName,
            p.detail,
            p.amount,
            p.paidAt,
          ]),
        ];
  const csv = "﻿" + rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
  const name = `${kind === "lines" ? "売上明細" : "支払"}_${fy.label}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
