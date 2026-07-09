import { Download, Plus } from "lucide-react";
import Link from "next/link";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getRepository } from "@/lib/data";
import type { InvoiceStatus, InvoiceType } from "@/lib/domain/types";
import { formatJPY } from "@/lib/utils";
import { outstandingAmount } from "@/lib/domain/calculations";
import { InvoiceFilters } from "./invoice-filters";

export const metadata = { title: "請求書" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const repo = await getRepository();
  const invoices = await repo.listInvoices({
    status: (sp.status as InvoiceStatus | "all") ?? "all",
    type: (sp.type as InvoiceType | "all") ?? "all",
    search: sp.q,
  });

  const total = invoices.reduce((s, i) => s + i.total, 0);
  const outstanding = invoices.reduce((s, i) => s + outstandingAmount(i), 0);

  return (
    <div>
      <PageHeader
        title="請求書"
        description="請求書の作成・送付・入金状況を一元管理します。"
        actions={
          <Link href="/invoices/new" className={buttonClasses()}>
            <Plus className="h-4 w-4" />
            新規作成
          </Link>
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
