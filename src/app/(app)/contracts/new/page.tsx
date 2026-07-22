import { PageHeader } from "@/components/ui/page-header";
import { getServiceRepository } from "@/lib/data";
import { ContractForm } from "../contract-form";

export const metadata = { title: "契約書の作成" };

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const sp = await searchParams;
  const repo = await getServiceRepository();
  const [customers, plans, templates, org] = await Promise.all([
    repo.listCustomers({ status: "active" }),
    repo.listPlans(),
    repo.listContractTemplates(),
    repo.getOrganization(),
  ]);

  // 甲の既定値: テンプレートの既定 + 自社(組織)情報で補完
  const templatesWithOrg = templates.map((t) => ({
    ...t,
    providerDefault: {
      ...t.providerDefault,
      name: t.providerDefault.name || org.name,
      postalCode: t.providerDefault.postalCode || org.postalCode,
      address: t.providerDefault.address || org.address,
      email: t.providerDefault.email || org.email,
    },
  }));

  return (
    <div>
      <PageHeader
        title="契約書の作成"
        description="テンプレートを元に、顧客に合わせて料金・条文を編集して下書きを作成します。"
      />
      <ContractForm
        customers={customers}
        plans={plans}
        templates={templatesWithOrg}
        initialCustomerId={sp.customer}
      />
    </div>
  );
}
