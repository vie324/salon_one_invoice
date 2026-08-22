import { Download, FileDown, Plus } from "lucide-react";
import Link from "next/link";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getServiceRepository } from "@/lib/data";
import type { InvoiceStatus, InvoiceType } from "@/lib/domain/types";
import { cn, formatJPY } from "@/lib/utils";
import { computeAgingBuckets, outstandingAmount } from "@/lib/domain/calculations";
import { InvoiceFilters } from "./invoice-filters";

export const metadata = { title: "請求書" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const repo = await getServiceRepository();
  const invoices = await repo.listInvoices({
    status: (sp.status as InvoiceStatus | "all") ?? "all",
    type: (sp.type as InvoiceType | "all") ?? "all",
    search: sp.q,
  });

  const total = invoices.reduce((s, i) => s + i.total, 0);
  const outstanding = invoices.reduce((s, i) => s + outstandingAmount(i), 0);
  // エイジングは絞り込みに関係なく全請求で集計する(督促の全体像を見るため)
  const allInvoices = await repo.listInvoices();
  const aging = computeAgingBuckets(allInvoices);

  const exportQuery = new URLSearchParams();
  if (sp.status && sp.status !== "all") exportQuery.set("status", sp.status);
  if (sp.type && sp.type !== "all") exportQuery.set("type", sp.type);
  if (sp.q) exportQuery.set("q", sp.q);

  return (
    <div>
      <PageHeader
        title="請求書"
        description="請求書の作成・送付・入金状況を一元管理します。"
        actions={
          <>
            <a
              href={`/api/export/invoices${exportQuery.size > 0 ? `?${exportQuery}` : ""}`}
              className={buttonClasses({ variant: "outline" })}
              title="現在の絞り込み条件でCSVをダウンロード(会計ソフト・Excel連携用)"
            >
              <FileDown className="h-4 w-4" />
              CSVエクスポート
            </a>
            <Link href="/invoices/new" className={buttonClasses()}>
              <Plus className="h-4 w-4" />
              新規作成
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile label="件数" value={`${invoices.length}件`} />
        <SummaryTile label="合計金額" value={formatJPY(total)} />
        <SummaryTile label="未収合計" value={formatJPY(outstanding)} accent />
        <div className="hidden sm:flex sm:items-center sm:justify-end">
          <Link
            href="/direct-debit"
            className={buttonClasses({ variant: "outline", size: "sm" })}
          >
            <Download className="h-4 w-4" />
            口座振替へ
          </Link>
        </div>
      </div>

      {/* 未収金エイジング(期限超過日数別の残高)。督促の優先順位づけに使う。 */}
      <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            未収金エイジング（支払期限からの経過日数・全請求）
          </span>
          <Link href="/invoices?status=overdue" className="text-xs text-primary hover:underline">
            期限超過の請求を見る
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {aging.map((b) => (
            <div key={b.key} className="rounded-md border border-border px-3 py-2">
              <div className="text-[11px] text-muted-foreground">{b.label}</div>
              <div
                className={cn(
                  "tabular mt-0.5 font-bold",
                  b.amount === 0
                    ? "text-muted-foreground"
                    : b.key === "current"
                      ? "text-foreground"
                      : b.key === "d1_30"
                        ? "text-warning"
                        : "text-destructive",
                )}
              >
                {formatJPY(b.amount)}
              </div>
              <div className="text-[11px] text-muted-foreground">{b.count}件</div>
            </div>
          ))}
        </div>
      </div>

      <Card className="p-4">
        <InvoiceFilters status={sp.status ?? "all"} query={sp.q ?? ""} />
        <InvoiceTable invoices={invoices} />
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`tabular mt-0.5 text-lg font-bold ${accent ? "text-warning" : ""}`}>{value}</div>
    </div>
  );
}
