import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { getServiceRepository } from "@/lib/data";
import { PrintButton } from "./print-button";

export const metadata = { title: "請求書（印刷）" };
export const dynamic = "force-dynamic";

export default async function PrintInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getServiceRepository();
  const invoice = await repo.getInvoice(id);
  if (!invoice) notFound();
  const org = await repo.getOrganization();

  return (
    <div className="min-h-screen bg-neutral-100 py-4 sm:py-8">
      <div className="no-print mx-auto mb-6 flex max-w-3xl items-center justify-between px-4">
        <span className="text-sm text-neutral-500">
          ブラウザの「PDFで保存」で保存できます。
        </span>
        <PrintButton />
      </div>
      <div className="px-4">
        <InvoiceDocument invoice={invoice} customer={invoice.customer} org={org} />
      </div>
    </div>
  );
}
