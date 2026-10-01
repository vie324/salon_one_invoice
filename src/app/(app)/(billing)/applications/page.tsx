import { ArrowRight, Inbox } from "lucide-react";
import Link from "next/link";
import { IssueLinkDialog } from "@/components/orders/issue-link-dialog";
import { ApplicationStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { appUrl } from "@/lib/config";
import { getServiceRepository } from "@/lib/data";
import { applicationLinkKind, requestedServices } from "@/lib/domain/application";
import { linkDetails } from "@/lib/orders/link-details";
import { formatDateTime } from "@/lib/utils";
import { ApplicationLinkManager } from "@/components/orders/link-manager";

export const metadata = { title: "申込・契約URL" };

// 一覧はデータ依存のため常にサーバーで描画する
export const dynamic = "force-dynamic";

/**
 * 申込・契約URLの一覧と、URLから届いた申込の一覧。
 * 申込のあとの流れ(受注確認・導入準備)は受注管理で追う。
 */
export default async function ApplicationsPage() {
  const repo = await getServiceRepository();
  const [links, applications, plans, agencies, members, referrals, org] = await Promise.all([
    repo.listApplicationLinks(),
    repo.listApplications(),
    repo.listPlans(),
    repo.listAgencies(),
    repo.listAgencyMembers(),
    repo.listReferrals(),
    repo.getOrganization(),
  ]);

  const customerLinks = links.filter((l) => applicationLinkKind(l) !== "agency");
  const agencyLinks = links.filter((l) => applicationLinkKind(l) === "agency");
  const details = linkDetails(links, { plans, agencies, members, referrals });
  const pendingOnly = applications.filter((a) => a.status === "submitted").length;
  const baseUrl = appUrl?.replace(/\/$/, "") ?? "";

  return (
    <div>
      <PageHeader
        title="申込・契約URL"
        description="お客様に渡すURLを発行します。お客様はURLから申込内容を入力し、料金と契約内容を確認して電子署名まで完了します（申込と契約が1本になりました）。届いた申込は受注管理に「受注確認待ち」として並びます。"
        actions={
          <>
            <Link
              href="/orders"
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-input bg-card px-4 text-sm font-medium hover:bg-muted md:h-10"
            >
              受注管理へ <ArrowRight className="h-4 w-4" />
            </Link>
            <IssueLinkDialog
              plans={plans}
              agencies={agencies}
              members={members}
              orgName={org.name}
            />
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="受付中のURL" value={`${links.filter((l) => l.active).length}件`} />
        <SummaryTile label="代理店URL" value={`${agencyLinks.length}件`} />
        <SummaryTile label="申込 合計" value={`${applications.length}件`} />
        <SummaryTile
          label="申込のみ・未対応"
          value={`${pendingOnly}件`}
          accent={pendingOnly > 0}
        />
      </div>

      <section className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold">お客様ごとのURL・紹介から発行したURL</h2>
        <ApplicationLinkManager links={customerLinks} baseUrl={baseUrl} details={details} />
      </section>

      <section className="mb-6 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">代理店URL</h2>
          <Link href="/agencies" className="text-xs text-primary hover:underline">
            代理店ごとの発行・実績は「代理店」画面で
          </Link>
        </div>
        <ApplicationLinkManager
          links={agencyLinks}
          baseUrl={baseUrl}
          details={details}
          emptyText="代理店URLはまだありません。代理店の画面から発行できます。"
        />
      </section>

      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold">届いた申込</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          申込＋契約URLからの申込は、顧客・契約書（締結済）・受注管理の案件まで自動で作られます。
          「申込のみ」のURLから届いたものは、内容を確認して「顧客として登録」→ 契約書を送付してください。
        </p>
        {applications.length === 0 ? (
          <EmptyState
            title="申込がありません"
            description="URLを発行してお客様にお渡しすると、送信された内容がここに表示されます。"
            icon={<Inbox className="h-5 w-5" />}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>法人名 / 個人名</TH>
                <TH>代表者 / ご担当者</TH>
                <TH>連絡先</TH>
                <TH>希望連携</TH>
                <TH>状態</TH>
                <TH>受付日時</TH>
                <TH>URL</TH>
              </TR>
            </THead>
            <TBody>
              {applications.map((a) => {
                const services = requestedServices(a);
                return (
                  <TR key={a.id}>
                    <TD primary>
                      <Link
                        href={`/applications/${a.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {a.companyName}
                      </Link>
                      <div className="max-w-[22rem] truncate text-xs text-muted-foreground">
                        {a.address}
                      </div>
                    </TD>
                    <TD>
                      <div>
                        {a.representativeTitle ? `${a.representativeTitle} ` : ""}
                        {a.representativeName || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.contactName ? `担当: ${a.contactName}` : "担当: 代表者と同じ"}
                      </div>
                    </TD>
                    <TD className="text-xs">
                      <div className="tabular">{a.phone || "—"}</div>
                      <div className="max-w-[14rem] truncate text-muted-foreground">
                        {a.email || "—"}
                      </div>
                    </TD>
                    <TD className="text-xs">
                      {services.length ? services.join(" / ") : "なし"}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1">
                        {a.contractId ? (
                          <Badge tone="success">契約締結済</Badge>
                        ) : (
                          <ApplicationStatusBadge status={a.status} />
                        )}
                        {a.customerId && (
                          <Link
                            href={`/orders/${a.customerId}`}
                            className="text-xs text-primary hover:underline"
                          >
                            案件へ
                          </Link>
                        )}
                      </div>
                    </TD>
                    <TD className="tabular text-xs">{formatDateTime(a.submittedAt)}</TD>
                    <TD className="text-xs text-muted-foreground">{a.linkName || "—"}</TD>
                  </TR>
                );
              })}
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
      <div className={`tabular mt-0.5 text-lg font-bold ${accent ? "text-warning" : ""}`}>
        {value}
      </div>
    </div>
  );
}
