import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getServiceRepository } from "@/lib/data";
import { InvoiceForm } from "../invoice-form";

export const metadata = { title: "請求書の作成" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer } = await searchParams;
  const repo = await getServiceRepository();
  const [customers, plans, org] = await Promise.all([
    repo.listCustomers({ status: "active" }),
    repo.listPlans(),
    repo.getOrganization(),
  ]);

  return (
    <div>
      <Link
        href="/invoices"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        請求書一覧へ
      </Link>
      <PageHeader title="請求書の作成" description="明細を入力し、下書き保存または送付します。" />
      <InvoiceForm
        customers={customers}
        plans={plans}
        defaultTaxRate={org.defaultTaxRate}
        defaultCustomerId={customer}
      />
    </div>
  );
}
