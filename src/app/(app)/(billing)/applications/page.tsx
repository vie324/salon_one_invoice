import { ArrowRight, FilePlus2, Inbox } from "lucide-react";
import Link from "next/link";
import { IssueLinkDialog } from "@/components/orders/issue-link-dialog";
import { ApplicationStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { appUrl } from "@/lib/config";
import { getServiceRepository } from "@/lib/data";
import {
  applicationLinkKind,
  isPendingApplication,
  requestedServices,
} from "@/lib/domain/application";
import {
  applicationBillingLookup,
  newInvoiceHref,
  type ApplicationBilling,
} from "@/lib/orders/application-billing";
import type { Application } from "@/lib/domain/types";
import { linkDetails } from "@/lib/orders/link-details";
import { loadOrderBook } from "@/lib/orders/load";
import { formatDateTime, formatJPY } from "@/lib/utils";
import { ApplicationLinkManager } from "@/components/orders/link-manager";
import { RegisterAndInvoiceButton } from "./register-invoice-button";

export const metadata = { title: "申込・契約URL" };

// 一覧はデータ依存のため常にサーバーで描画する
export const dynamic = "force-dynamic";

/**
 * 申込・契約URLの一覧と、URLから届いた申込の一覧。
 * 申込のあとの流れ(受注確認・導入準備)は受注管理で追う。
 * 届いた申込からは、そのまま請求書を作成できる(まだ顧客でなければ顧客登録から)。
 */
export default async function ApplicationsPage() {
  const repo = await getServiceRepository();
  const [links, referrals, org, book] = await Promise.all([
    repo.listApplicationLinks(),
    repo.listReferrals(),
    repo.getOrganization(),
    // 顧客が実在するか・請求書と入金の状況を申込ごとに出すため、受注管理と同じ集計を読む
    loadOrderBook(repo, { sync: false }),
  ]);
  const { applications, plans, agencies, agencyMembers: members } = book;
  const billingOf = applicationBillingLookup(book);

  const customerLinks = links.filter((l) => applicationLinkKind(l) !== "agency");
  const agencyLinks = links.filter((l) => applicationLinkKind(l) === "agency");
  const details = linkDetails(links, { plans, agencies, members, referrals });
  const rows = applications.map((a) => ({ app: a, billing: billingOf(a) }));
  const pendingCount = rows.filter((r) => isPendingApplication(r.app, r.billing.state)).length;
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
          label="顧客登録がまだの申込"
          value={`${pendingCount}件`}
          accent={pendingCount > 0}
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
          申込＋契約URLからの申込は、顧客・契約書（締結済）・受注管理の案件まで自動で作られます（請求は受注管理の「受注を確定する」で始まります）。
          「申込のみ」のURLから届いたものは「顧客登録して請求書を作成」で、申込内容のまま顧客を登録して請求書を作れます。
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
                <TH>請求</TH>
                <TH>受付日時</TH>
                <TH>URL</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ app: a, billing }) => {
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
                        {a.contractId && billing.state === "registered" ? (
                          <Badge tone="success">契約締結済</Badge>
                        ) : (
                          <ApplicationStatusBadge status={billing.display} />
                        )}
                        {billing.state === "registered" && a.customerId && (
                          <Link
                            href={`/orders/${a.customerId}`}
                            className="text-xs text-primary hover:underline"
                          >
                            案件へ
                          </Link>
                        )}
                      </div>
                    </TD>
                    <TD className="text-xs">
                      <BillingCell app={a} billing={billing} />
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

/** 「請求」欄: 請求書と入金の状況、請求書を作るボタン */
function BillingCell({
  app,
  billing,
}: {
  app: Pick<Application, "id" | "companyName" | "customerId" | "status">;
  billing: ApplicationBilling;
}) {
  if (billing.state === "deleted") {
    return (
      <div className="space-y-1">
        <div className="text-destructive">登録した顧客は削除されています</div>
        <Link href={`/applications/${app.id}`} className="text-primary hover:underline">
          ゴミ箱から戻す・登録し直す →
        </Link>
      </div>
    );
  }
  if (billing.state === "none") {
    if (app.status === "archived") return <span className="text-muted-foreground">—</span>;
    return <RegisterAndInvoiceButton applicationId={app.id} companyName={app.companyName} />;
  }

  const customerId = app.customerId!;
  return (
    <div className="space-y-1.5">
      <div>
        {billing.invoices.length === 0 ? (
          <span className="text-muted-foreground">請求書なし</span>
        ) : (
          <>
            <span>請求書 {billing.invoices.length}件</span>
            {billing.unpaidCount > 0 ? (
              <div className="tabular font-medium text-[hsl(38_92%_32%)] dark:text-warning">
                未入金 {formatJPY(billing.unpaidAmount)}（{billing.unpaidCount}件）
              </div>
            ) : billing.draftCount > 0 ? (
              <div className="text-muted-foreground">下書き {billing.draftCount}件（未送付）</div>
            ) : (
              <div className="text-success">すべて入金済み</div>
            )}
          </>
        )}
      </div>
      {billing.awaitingConfirm ? (
        <Link
          href={`/orders/${customerId}`}
          className={buttonClasses({ size: "sm", variant: "outline" })}
          title="契約書どおりの初回請求書と毎月の請求を作成します"
        >
          受注を確定して請求
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <Link
          href={newInvoiceHref(customerId, billing)}
          className={buttonClasses({ size: "sm", variant: "outline" })}
        >
          <FilePlus2 className="h-4 w-4" />
          請求書を作成
        </Link>
      )}
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
