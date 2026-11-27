import { ChevronLeft, ChevronRight, Download, Printer } from "lucide-react";
import Link from "next/link";
import { LedgerView } from "@/components/accounting/ledger-view";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { loadRevenueLedger } from "@/lib/accounting/load";
import { getServiceRepository } from "@/lib/data";
import { cn, formatJPY } from "@/lib/utils";

export const metadata = { title: "売上台帳" };
export const dynamic = "force-dynamic";

/**
 * 売上台帳(税理士さんと共有するページ)。
 * 決算期(決算月の翌月〜決算月)ごとに、計上月(サービスを提供した月)で売上を並べる。
 */
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const { fy } = await searchParams;
  const repo = await getServiceRepository();
  const { org, ledger, currentEndYear } = await loadRevenueLedger(repo, fy);
  const year = ledger.fiscalYear;
  const query = `fy=${year.endYear}`;

  return (
    <div>
      <PageHeader
        title="売上台帳"
        description={`${org.name}の売上を、サービスを提供した月（計上月）ごとにまとめています。`}
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/export/accounting?${query}&kind=lines`} className={buttonClasses({ variant: "outline", size: "sm" })}>
              <Download className="h-4 w-4" />
              明細CSV
            </a>
            <a href={`/api/export/accounting?${query}&kind=payouts`} className={buttonClasses({ variant: "outline", size: "sm" })}>
              <Download className="h-4 w-4" />
              支払CSV
            </a>
            <Link href={`/print/accounting?${query}`} target="_blank" className={buttonClasses({ size: "sm" })}>
              <Printer className="h-4 w-4" />
              印刷・PDF
            </Link>
          </div>
        }
      />

      {/* 決算期の切り替え(スマホでも1行に収まるよう、狭い画面では矢印だけにする) */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href={`/accounting?fy=${year.endYear - 1}`}
          className={buttonClasses({ variant: "outline", size: "sm" })}
          aria-label="前の期"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">前の期</span>
        </Link>
        <div className="flex flex-col rounded-md border border-border bg-card px-3 py-1 text-sm sm:flex-row sm:items-baseline sm:gap-2 sm:py-1.5">
          <span className="font-semibold">{year.label}</span>
          <span className="text-xs text-muted-foreground sm:text-sm">{year.rangeLabel}</span>
        </div>
        <Link
          href={`/accounting?fy=${year.endYear + 1}`}
          className={buttonClasses({ variant: "outline", size: "sm" })}
          aria-label="次の期"
        >
          <span className="hidden sm:inline">次の期</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
        {year.endYear !== currentEndYear && (
          <Link href="/accounting" className="text-sm text-primary hover:underline">
            今期へ戻る
          </Link>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="売上（税抜）" value={formatJPY(ledger.totals.sales)} sub={`初期費用 ${formatJPY(ledger.totals.initial)}・月額 ${formatJPY(ledger.totals.monthly)}`} />
        <StatCard label="消費税" value={formatJPY(ledger.totals.tax)} sub={`売上（税込）${formatJPY(ledger.totals.total)}`} />
        <StatCard label="入金済み（税込）" value={formatJPY(ledger.collected)} sub="この期に計上した請求書のうち" />
        <StatCard
          label="未収（税込）"
          value={<span className={cn(ledger.receivable > 0 && "text-warning")}>{formatJPY(ledger.receivable)}</span>}
          sub={`支払（代理店報酬・紹介謝礼）${formatJPY(ledger.totals.payouts)}`}
        />
      </div>

      <LedgerView ledger={ledger} />

      <div className="mt-6 space-y-1 rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">計上月の決め方</p>
        <p>・初期費用は、利用を始めた月。月額は、その月の分（さかのぼって請求した月額も、その月）。</p>
        <p>・計上月の入っていない明細は、毎月の請求書なら対象月、それ以外は請求書の発行月で数えています。</p>
        <p>・取消の請求書は含めません。入金・未収は請求書ごと（税込）です。</p>
        {ledger.issueMonthFallbacks > 0 && (
          <p>・この期で、計上月の入っていない明細は {ledger.issueMonthFallbacks} 行です（発行月で計上）。</p>
        )}
      </div>
    </div>
  );
}
