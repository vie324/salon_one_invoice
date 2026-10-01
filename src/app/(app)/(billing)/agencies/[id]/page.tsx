import { ArrowLeft, ChevronLeft, ChevronRight, Link2, MessageCircle, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicationLinkManager } from "@/components/orders/link-manager";
import { IssueLinkDialog } from "@/components/orders/issue-link-dialog";
import { DealTypeBadge, StageBadge } from "@/components/orders/order-ui";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { appUrl } from "@/lib/config";
import { getServiceRepository } from "@/lib/data";
import { applicationLinkKind } from "@/lib/domain/application";
import {
  agencyCommissionLines,
  agencyRateLabel,
  computeAgencyStatement,
  summarizeAgencyCommissions,
} from "@/lib/domain/agency";
import {
  AGENCY_DEAL_TYPES,
  agencyCommissionStatusLabels,
  agencyCommissionStatusTone,
  referralStatusLabels,
  referralStatusTone,
} from "@/lib/domain/constants";
import { contactWishLabel } from "@/lib/domain/referral";
import { linkDetails } from "@/lib/orders/link-details";
import { loadOrderBook } from "@/lib/orders/load";
import { addMonths, currentMonth, formatDate, formatJPY, formatPercent } from "@/lib/utils";
import {
  AgencyEditButton,
  CommissionPaidButton,
  MemberManager,
  SendStatementButton,
} from "./agency-client";

export const metadata = { title: "代理店の詳細" };
export const dynamic = "force-dynamic";

export default async function AgencyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();

  const repo = await getServiceRepository();
  const agency = await repo.getAgency(id);
  if (!agency) notFound();

  const [members, customers, invoices, commissions, links, referrals, plans, agencies, allMembers, org, book] =
    await Promise.all([
      repo.listAgencyMembers(id),
      repo.listCustomers(),
      repo.listInvoices(),
      repo.listAgencyCommissions({ agencyId: id }),
      repo.listApplicationLinks(),
      repo.listReferrals(),
      repo.listPlans(),
      repo.listAgencies(),
      repo.listAgencyMembers(),
      repo.getOrganization(),
      loadOrderBook(repo),
    ]);

  const statement = computeAgencyStatement({ agency, members, customers, invoices, commissions, month });
  const lines = agencyCommissionLines({ agency, commissions, customers, members, invoices });
  const summary = summarizeAgencyCommissions(lines);
  const unpaid = lines.filter((l) => l.status === "payable");
  const pending = lines.filter((l) => l.status === "pending");
  const agencyLinks = links.filter((l) => l.agencyId === id && applicationLinkKind(l) === "agency");
  const details = linkDetails(agencyLinks, { plans, agencies, members: allMembers, referrals });
  const leads = referrals.filter((r) => r.agencyId === id);
  const acquired = book.rows.filter((r) => r.customer.agencyId === id);
  const monthUnpaidIds = statement.lines.filter((l) => l.status === "payable").map((l) => l.commission.id);
  const [y, m] = month.split("-");
  const monthLabel = `${y}年${Number(m)}月`;
  // 代理店向けには「代理店版」のプランを既定にする(無ければ先頭)
  const agencyPlan = plans.find((p) => p.active && p.name.includes("代理店")) ?? null;

  return (
    <div>
      <Link
        href="/agencies"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        代理店一覧へ
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold sm:text-2xl">{agency.name}</h1>
            <Badge tone={agency.active ? "success" : "neutral"} dot>
              {agency.active ? "取引中" : "停止"}
            </Badge>
            <DealTypeBadge dealType={agency.defaultDealType} withRate />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {agency.code} ・ 担当 {agency.contactName || "—"} ・ {AGENCY_DEAL_TYPES[agency.defaultDealType].scope}
          </p>
        </div>
        <AgencyEditButton agency={agency} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* 代理店URL */}
          <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  代理店用の申込・契約URL（紹介〜契約まで）
                </CardTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  代理店がお客様に渡すURLです。お客様は「まずは相談したい」（連絡先と希望日時だけ）か、
                  「このまま申し込む」（入力 → 料金確認 → 電子署名まで）を選べます。どちらも
                  {agency.name}経由として自動で記録され、受注確定で報酬が計上されます。営業担当ごとに分けて発行すると、担当別の実績も出せます。
                </p>
              </div>
              <IssueLinkDialog
                plans={plans}
                agencies={agencies}
                members={allMembers}
                orgName={org.name}
                mode="agency"
                defaults={{ name: `${agency.name}`, agencyId: agency.id, planId: agencyPlan?.id ?? null }}
                triggerLabel="URLを発行"
              />
            </CardHeader>
            <CardContent>
              <ApplicationLinkManager
                links={agencyLinks}
                baseUrl={appUrl?.replace(/\/$/, "") ?? ""}
                details={details}
                emptyText="まだURLがありません。「URLを発行」から作成し、案内文ごと代理店へお送りください。"
              />
            </CardContent>
          </Card>

          {/* 月次の報酬明細 */}
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>{monthLabel}分 報酬明細</CardTitle>
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/agencies/${id}?month=${addMonths(month, -1)}`}
                  className={buttonClasses({ variant: "outline", size: "sm" })}
                  aria-label="前月"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
                <span className="tabular px-1 text-sm font-medium">{month}</span>
                <Link
                  href={`/agencies/${id}?month=${addMonths(month, 1)}`}
                  className={buttonClasses({ variant: "outline", size: "sm" })}
                  aria-label="翌月"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {monthLabel}にお客様の初期費用の入金を確認した案件の報酬です（入金待ちの案件は、入金を確認した月の明細に入ります）。
              </p>
              <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
                <StatBox label="報酬合計" value={formatJPY(statement.total)} accent />
                <StatBox label="うち支払済" value={formatJPY(statement.paidTotal)} />
                <StatBox label="うち未払い" value={formatJPY(statement.unpaidTotal)} />
              </div>

              {statement.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">この月に支払対象になった報酬はありません。</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>お客様</TH>
                      <TH>営業担当</TH>
                      <TH>区分</TH>
                      <TH className="text-right">初期費用(税抜)</TH>
                      <TH className="text-right">報酬</TH>
                      <TH>状態</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {statement.lines.map((l) => (
                      <TR key={l.commission.id}>
                        <TD primary>
                          <Link href={`/orders/${l.commission.customerId}`} className="text-primary hover:underline">
                            {l.customerName}
                          </Link>
                          <div className="text-xs text-muted-foreground">入金確認 {formatDate(l.confirmedOn)}</div>
                        </TD>
                        <TD className="text-muted-foreground">{l.memberName}</TD>
                        <TD>
                          <DealTypeBadge dealType={l.commission.dealType} />
                        </TD>
                        <TD className="tabular text-right">{formatJPY(l.commission.baseAmount)}</TD>
                        <TD className="tabular text-right font-medium">
                          {formatJPY(l.commission.amount)}
                          <div className="text-[11px] font-normal text-muted-foreground">
                            {formatPercent(l.commission.rate, 0)}
                          </div>
                        </TD>
                        <TD>
                          <Badge tone={agencyCommissionStatusTone[l.status]}>
                            {agencyCommissionStatusLabels[l.status]}
                            {l.status === "paid" && l.commission.paidAt ? `（${formatDate(l.commission.paidAt)}）` : ""}
                          </Badge>
                        </TD>
                        <TD className="text-right">
                          <CommissionPaidButton
                            agencyId={id}
                            ids={[l.commission.id]}
                            paid={l.status !== "paid"}
                            label={l.status === "paid" ? "取消" : "支払済"}
                          />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}

              {statement.members.length > 1 && (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  営業担当別:
                  {statement.members.map((mem) => (
                    <span key={mem.memberId ?? "none"} className="rounded-full bg-muted px-2 py-0.5">
                      {mem.memberName} {mem.count}件 {formatJPY(mem.total)}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {monthUnpaidIds.length > 0 && (
                  <CommissionPaidButton
                    agencyId={id}
                    ids={monthUnpaidIds}
                    paid
                    size="md"
                    label={`この月の未払い ${monthUnpaidIds.length}件を支払済みにする`}
                  />
                )}
                <SendStatementButton agencyId={id} month={month} hasEmail={!!agency.email} />
                <a
                  href={`/print/agencies/${id}?month=${month}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses({ variant: "outline" })}
                >
                  <Printer className="h-4 w-4" />
                  支払明細書を印刷 / PDF
                </a>
              </div>
            </CardContent>
          </Card>

          {/* 未払い・入金待ち(月をまたいで) */}
          <Card>
            <CardHeader>
              <CardTitle>未払い・入金待ちの報酬</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
                <StatBox label={`未払い（${summary.unpaidCount}件）`} value={formatJPY(summary.unpaidTotal)} accent />
                <StatBox label={`入金待ち（${summary.pendingCount}件）`} value={formatJPY(summary.pendingTotal)} />
                <StatBox label="これまでの支払済" value={formatJPY(summary.paidTotal)} />
              </div>
              {[...unpaid, ...pending].length === 0 ? (
                <p className="text-sm text-muted-foreground">未払い・入金待ちの報酬はありません。</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {[...unpaid, ...pending].map((l) => (
                    <li key={l.commission.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <Link href={`/orders/${l.commission.customerId}`} className="font-medium text-primary hover:underline">
                          {l.customerName}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {AGENCY_DEAL_TYPES[l.commission.dealType].label}・{agencyRateLabel(l.commission.dealType)}
                          {l.confirmedOn ? `・入金確認 ${formatDate(l.confirmedOn)}` : ""}
                        </span>
                      </div>
                      <span className="flex items-center gap-2">
                        <span className="tabular font-medium">{formatJPY(l.commission.amount)}</span>
                        <Badge tone={agencyCommissionStatusTone[l.status]}>
                          {agencyCommissionStatusLabels[l.status]}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 獲得したお客様 */}
          <Card>
            <CardHeader>
              <CardTitle>獲得したお客様（{acquired.length}件）</CardTitle>
            </CardHeader>
            <CardContent>
              {acquired.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  まだありません。代理店URLから申し込まれると自動で紐付きます（顧客の編集画面から手動で紐付けることもできます）。
                </p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {acquired.map((r) => (
                    <li key={r.customer.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <Link href={`/orders/${r.customer.id}`} className="font-medium text-primary hover:underline">
                          {r.customer.name}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.agencyMember?.name ?? "担当なし"}
                          {r.dealType ? `・${AGENCY_DEAL_TYPES[r.dealType].label}` : ""}
                        </span>
                      </div>
                      <span className="flex items-center gap-2">
                        {r.progress.next && !r.progress.next.waiting && r.progress.next.owner === "agency" && (
                          <Badge tone="warning">代理店の対応待ち</Badge>
                        )}
                        <StageBadge stage={r.progress.stage} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* 相談(問い合わせ) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" />
                「まずは相談したい」から届いた問い合わせ（{leads.length}件）
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leads.length === 0 ? (
                <p className="text-sm text-muted-foreground">まだありません。</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {leads.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <span className="font-medium">{r.companyName || r.contactName}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{contactWishLabel(r)}</span>
                      </div>
                      <Badge tone={referralStatusTone[r.status]}>{referralStatusLabels[r.status]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/referrals" className="mt-2 inline-block text-xs text-primary hover:underline">
                紹介・問い合わせの画面で対応する →
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>連絡先</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <div>担当者: {agency.contactName || "—"}</div>
              <div>メール: {agency.email || "—"}</div>
              <div>電話: {agency.phone || "—"}</div>
              <div>住所: {agency.address || "—"}</div>
              {agency.notes && (
                <p className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-xs">{agency.notes}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>営業マン（{members.length}名）</CardTitle>
            </CardHeader>
            <CardContent>
              <MemberManager agencyId={id} members={members} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`tabular mt-0.5 text-base font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
