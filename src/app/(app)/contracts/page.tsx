import { FileSignature, LayoutTemplate, Plus } from "lucide-react";
import Link from "next/link";
import { ContractStatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getRepository } from "@/lib/data";
import type { ContractStatus } from "@/lib/domain/types";
import { formatDate, formatJPY } from "@/lib/utils";
import { ContractFilters } from "./contract-filters";

export const metadata = { title: "契約書" };

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const repo = await getRepository();
  const contracts = await repo.listContracts({
    status: (sp.status as ContractStatus | "all") ?? "all",
    search: sp.q,
  });

  const all = await repo.listContracts();
  const awaiting = all.filter((c) => c.status === "sent" || c.status === "viewed").length;
  const signed = all.filter((c) => c.status === "signed").length;
  const drafts = all.filter((c) => c.status === "draft").length;

  return (
    <div>
      <PageHeader
        title="契約書"
        description="申込書・契約書の作成、電子契約(署名依頼〜締結)、証跡管理を行います。"
        actions={
          <>
            <Link
              href="/contracts/templates"
              className={buttonClasses({ variant: "outline" })}
            >
              <LayoutTemplate className="h-4 w-4" />
              テンプレート
            </Link>
            <Link href="/contracts/new" className={buttonClasses()}>
              <Plus className="h-4 w-4" />
              新規作成
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile label="全契約書" value={`${all.length}件`} />
        <SummaryTile label="署名待ち" value={`${awaiting}件`} accent={awaiting > 0} />
        <SummaryTile label="締結済" value={`${signed}件`} />
        <SummaryTile label="下書き" value={`${drafts}件`} />
      </div>

      <Card className="p-4">
        <ContractFilters status={sp.status ?? "all"} query={sp.q ?? ""} />
        {contracts.length === 0 ? (
          <EmptyState
            title="契約書がありません"
            description="テンプレートから契約書を作成し、電子契約の署名依頼を送付できます。"
            icon={<FileSignature className="h-5 w-5" />}
            action={
              <Link href="/contracts/new" className={buttonClasses({ size: "sm" })}>
                <Plus className="h-4 w-4" />
                契約書を作成
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>契約書番号</TH>
                <TH>顧客</TH>
                <TH>ステータス</TH>
                <TH className="text-right">初期費用(税抜)</TH>
                <TH className="text-right">月額(税抜)</TH>
                <TH>送付日</TH>
                <TH>締結日</TH>
              </TR>
            </THead>
            <TBody>
              {contracts.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link
                      href={`/contracts/${c.id}`}
                      className="tabular font-medium text-primary hover:underline"
                    >
                      {c.contractNumber}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.terms.planName || c.title}</div>
                  </TD>
                  <TD>
                    <div className="font-medium">{c.customer?.name}</div>
                    <div className="text-xs text-muted-foreground">{c.customerParty.representative}</div>
                  </TD>
                  <TD>
                    <ContractStatusBadge status={c.status} />
                  </TD>
                  <TD className="tabular text-right">
                    {c.terms.initialFee != null ? formatJPY(c.terms.initialFee) : "—"}
                  </TD>
                  <TD className="tabular text-right">
                    {c.terms.monthlyFee != null ? formatJPY(c.terms.monthlyFee) : "—"}
                  </TD>
                  <TD className="tabular">{formatDate(c.sentAt)}</TD>
                  <TD className="tabular">{formatDate(c.signedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
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
