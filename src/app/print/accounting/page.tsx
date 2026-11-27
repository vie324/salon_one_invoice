import { LedgerView } from "@/components/accounting/ledger-view";
import { requirePageAccess } from "@/lib/access";
import { loadRevenueLedger } from "@/lib/accounting/load";
import { getServiceRepository } from "@/lib/data";
import { canViewAccounting } from "@/lib/domain/constants";
import { formatJPY, toISODate } from "@/lib/utils";
import { PrintButton } from "@/app/print/invoices/[id]/print-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const { fy } = await searchParams;
  return { title: { absolute: `売上台帳_${/^\d{4}$/.test(fy ?? "") ? `${fy}期` : "今期"}` } };
}

/** 売上台帳の印刷・PDF(税理士さんへの提出用) */
export default async function PrintAccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  await requirePageAccess(canViewAccounting);
  const { fy } = await searchParams;
  const repo = await getServiceRepository();
  const { org, ledger } = await loadRevenueLedger(repo, fy);
  const year = ledger.fiscalYear;

  return (
    <div className="min-h-screen bg-neutral-100 py-4 print:bg-white sm:py-8">
      {/* 12か月の表が1行に収まるよう、このページだけA4横向きで印刷する */}
      <style>{"@media print { @page { size: A4 landscape; margin: 12mm; } }"}</style>
      <div className="no-print mx-auto mb-6 flex max-w-5xl items-center justify-between gap-3 px-4">
        <span className="text-sm text-neutral-500">「PDFを保存」を押し、送信先で「PDFに保存」を選んでください（A4横向きで出力します）。</span>
        <PrintButton label="PDFを保存" />
      </div>
      <div className="print-container mx-auto max-w-5xl rounded-lg bg-white p-6 shadow-sm">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-2 border-b border-neutral-300 pb-3">
          <div>
            <h1 className="text-xl font-bold">売上台帳　{year.label}</h1>
            <p className="text-sm text-neutral-600">
              {year.rangeLabel}・{org.name}
            </p>
          </div>
          <div className="text-right text-xs text-neutral-600">
            <div>売上（税抜）{formatJPY(ledger.totals.sales)}・消費税 {formatJPY(ledger.totals.tax)}</div>
            <div>出力日 {toISODate(new Date(Date.now() + 9 * 3600 * 1000)).replace(/-/g, "/")}</div>
          </div>
        </header>
        <LedgerView ledger={ledger} print />
        <p className="mt-6 text-[10px] text-neutral-500">
          計上月はサービスを提供した月です（初期費用は利用を始めた月、月額はその月の分）。取消の請求書は含めません。
        </p>
      </div>
    </div>
  );
}
