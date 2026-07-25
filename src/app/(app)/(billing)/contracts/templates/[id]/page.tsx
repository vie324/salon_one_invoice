import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getServiceRepository } from "@/lib/data";
import { TemplateForm } from "./template-form";

export const metadata = { title: "テンプレートの編集" };

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getServiceRepository();
  const template = await repo.getContractTemplate(id);
  if (!template) notFound();

  return (
    <div>
      <PageHeader
        title={`テンプレートの編集 — ${template.name}`}
        description={`現在 v${template.version}。保存すると版が上がります。既存の契約書には影響しません。`}
      />
      <TemplateForm template={template} />
    </div>
  );
}
