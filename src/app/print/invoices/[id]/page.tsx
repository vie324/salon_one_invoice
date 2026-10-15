import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { getServiceRepository } from "@/lib/data";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * ページのタイトルは「PDFに保存」したときの既定のファイル名になる。
 * 請求書番号とお客様名を入れて、保存したファイルを見分けやすくする。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const repo = await getServiceRepository();
  const invoice = await repo.getInvoice(id);
  if (!invoice) return { title: "請求書" };
  const name = invoice.customer?.name ? `_${invoice.customer.name}様` : "";
  return { title: { absolute: `請求書_${invoice.invoiceNumber}${name}` } };
}

export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdf?: string }>;
}) {
  const { id } = await params;
  const { pdf } = await searchParams;
  const repo = await getServiceRepository();
  const invoice = await repo.getInvoice(id);
  if (!invoice) notFound();
  const org = await repo.getOrganization();

  return (
    <div className="min-h-screen bg-neutral-100 py-4 sm:py-8">
      <div className="no-print mx-auto mb-6 flex max-w-3xl items-center justify-between gap-3 px-4">
        <span className="text-sm text-neutral-500">
          「PDFを保存」を押し、送信先で「PDFに保存」を選んでください。
        </span>
        <PrintButton label="PDFを保存" auto={pdf === "1"} />
      </div>
      <div className="px-4">
        <InvoiceDocument invoice={invoice} customer={invoice.customer} org={org} />
      </div>
    </div>
  );
}
