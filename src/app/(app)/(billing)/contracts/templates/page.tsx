import { ChevronLeft, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "契約書テンプレート" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function ContractTemplatesPage() {
  const repo = await getServiceRepository();
  const templates = await repo.listContractTemplates();

  return (
    <div>
      <PageHeader
        title="契約書テンプレート"
        description="契約書のひな形を管理します。契約作成時に内容がコピーされるため、テンプレートの変更は既存の契約書に影響しません。"
        actions={
          <Link href="/contracts" className={buttonClasses({ variant: "outline" })}>
            <ChevronLeft className="h-4 w-4" />
            契約書一覧へ
          </Link>
        }
      />

      <Card className="p-4">
        <Table>
          <THead>
            <TR>
              <TH>テンプレート名</TH>
              <TH>書面タイトル</TH>
              <TH className="text-right">条文数</TH>
              <TH className="text-right">版</TH>
              <TH>状態</TH>
              <TH>更新日</TH>
            </TR>
          </THead>
          <TBody>
            {templates.map((t) => (
              <TR key={t.id}>
                <TD>
                  <Link
                    href={`/contracts/templates/${t.id}`}
                    className="flex items-center gap-2 font-medium text-primary hover:underline"
                  >
                    <LayoutTemplate className="h-4 w-4 shrink-0" />
                    {t.name}
                  </Link>
                  {t.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{t.description}</div>
                  )}
                </TD>
                <TD>{t.docTitle}</TD>
                <TD className="tabular text-right">{t.sections.length}</TD>
                <TD className="tabular text-right">v{t.version}</TD>
                <TD>
                  <Badge tone={t.active ? "success" : "neutral"}>
                    {t.active ? "有効" : "無効"}
                  </Badge>
                </TD>
                <TD className="tabular">{formatDate(t.updatedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
