import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getServiceRepository } from "@/lib/data";
import { ContractForm } from "../../contract-form";

export const metadata = { title: "契約書の編集" };

export default async function EditContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getServiceRepository();
  const contract = await repo.getContract(id);
  if (!contract) notFound();
  // 下書き以外は編集不可(内容凍結)。詳細ページへ戻す。
  if (contract.status !== "draft") redirect(`/contracts/${id}`);

  const [customers, plans, templates] = await Promise.all([
    repo.listCustomers(),
    repo.listPlans(),
    repo.listContractTemplates(),
  ]);

  return (
    <div>
      <PageHeader
        title={`契約書の編集 — ${contract.contractNumber}`}
        description="下書きの間のみ内容を編集できます。送付すると内容は凍結されます。"
      />
      <ContractForm
        customers={customers}
        plans={plans}
        templates={templates}
        initial={contract}
      />
    </div>
  );
}
