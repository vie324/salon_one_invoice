import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getServiceRepository } from "@/lib/data";
import { invoiceTypeLabels } from "@/lib/domain/constants";
import type { InvoiceType } from "@/lib/domain/types";
import { InvoiceForm, type PendingContract } from "../invoice-form";

export const metadata = { title: "請求書の作成" };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; type?: string }>;
}) {
  const { customer, type } = await searchParams;
  const repo = await getServiceRepository();
  // 休止中のお客様にも、残りの請求(過去分・最終月など)を出せるよう全員を渡す(フォームで分けて表示)
  const [customers, plans, org, signedContracts] = await Promise.all([
    repo.listCustomers(),
    repo.listPlans(),
    repo.getOrganization(),
    repo.listContracts({ status: "signed" }),
  ]);
  // 締結済みで、まだ受注確定(請求の開始)していない契約書。初回請求書は受注確定で作るよう案内する
  const pendingContracts: PendingContract[] = signedContracts
    .filter((c) => !c.linkedSubscriptionId && !c.linkedInvoiceId)
    .map((c) => ({ customerId: c.customerId, contractNumber: c.contractNumber }));
  const defaultType =
    type && Object.hasOwn(invoiceTypeLabels, type) ? (type as InvoiceType) : undefined;

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
        defaultType={defaultType}
        pendingContracts={pendingContracts}
      />
    </div>
  );
}
