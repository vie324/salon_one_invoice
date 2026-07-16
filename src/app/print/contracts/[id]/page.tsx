import { notFound } from "next/navigation";
import { ContractCertificate } from "@/components/contracts/contract-certificate";
import { ContractDocument } from "@/components/contracts/contract-document";
import { getRepository } from "@/lib/data";
import { PrintButton } from "@/app/print/invoices/[id]/print-button";

export const metadata = { title: "契約書（印刷）" };

/** 契約書 + (締結済みの場合)締結証明書の印刷/PDF出力ページ。 */
export default async function PrintContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getRepository();
  const contract = await repo.getContract(id);
  if (!contract) notFound();
  const org = await repo.getOrganization();
  const events = contract.status === "signed" ? await repo.listContractEvents(id) : [];

  return (
    <div className="min-h-screen bg-neutral-100 py-8">
      <div className="no-print mx-auto mb-6 flex max-w-3xl items-center justify-between px-4">
        <span className="text-sm text-neutral-500">
          ブラウザの「PDFで保存」で保存できます。
          {contract.status === "signed" && " 締結証明書も併せて出力されます。"}
        </span>
        <PrintButton />
      </div>
      <div className="space-y-8 px-4">
        <ContractDocument contract={contract} />
        {contract.status === "signed" && (
          <ContractCertificate contract={contract} events={events} org={org} />
        )}
      </div>
    </div>
  );
}
