import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import {
  addMonths,
  computeAgencyStatement,
  currentMonth,
} from "@/lib/domain/agency";
import { invoiceStatusLabels } from "@/lib/domain/constants";
import { formatDate, formatJPY, formatPercent } from "@/lib/utils";
import {
  AgencyEditButton,
  MemberManager,
  SendStatementButton,
} from "./agency-client";

export const metadata = { title: "代理店の詳細" };

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

  const [members, customers, invoices] = await Promise.all([
    repo.listAgencyMembers(id),
    repo.listCustomers(),
    repo.listInvoices(),
  ]);
  const statement = computeAgencyStatement({ agency, members, customers, invoices, month });
  const attributed = customers.filter((c) => c.agencyId === id);
  const [y, m] = month.split("-");
  const monthLabel = `${y}年${Number(m)}月`;

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
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {agency.code} ・ 手数料率 {formatPercent(agency.commissionRate, 0)} ・ 担当 {agency.contactName || "—"}
          </p>
        </div>
        <AgencyEditButton agency={agency} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* 月次支払明細 */}
          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle>{monthLabel}分 支払明細</CardTitle>
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
              <div className="grid grid-cols-3 gap-3">
                <StatBox label="対象請求(税抜)" value={formatJPY(statement.invoicedSubtotal)} />
                <StatBox label="入金済売上(税抜)" value={formatJPY(statement.paidSubtotal)} />
                <StatBox
                  label={`支払額（${formatPercent(agency.commissionRate, 0)}）`}
                  value={formatJPY(statement.commission)}
                  accent
                />
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">営業担当別</h3>
                {statement.members.length === 0 ? (
                  <p className="text-sm text-muted-foreground">対象月の実績はありません。</p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>営業担当</TH>
                        <TH className="text-right">顧客数</TH>
                        <TH className="text-right">請求(税抜)</TH>
                        <TH className="text-right">入金済(税抜)</TH>
                        <TH className="text-right">支払額</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {statement.members.map((mem) => (
                        <TR key={mem.memberId ?? "none"}>
                          <TD className="font-medium">{mem.memberName}</TD>
                          <TD className="tabular text-right">{mem.customerCount}件</TD>
                          <TD className="tabular text-right">{formatJPY(mem.invoicedSubtotal)}</TD>
                          <TD className="tabular text-right">{formatJPY(mem.paidSubtotal)}</TD>
                          <TD className="tabular text-right font-medium">{formatJPY(mem.commission)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">明細（対象請求 {statement.lines.length}件）</h3>
                {statement.lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    対象月の請求はありません。顧客に代理店を紐付けると、その顧客の請求が集計されます。
                  </p>
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>請求書</TH>
                        <TH>顧客</TH>
                        <TH>営業担当</TH>
                        <TH className="text-right">金額(税抜)</TH>
                        <TH>入金状況</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {statement.lines.map((l) => (
                        <TR key={l.invoiceId}>
                          <TD>
                            <Link
                              href={`/invoices/${l.invoiceId}`}
                              className="tabular text-primary hover:underline"
                            >
                              {l.invoiceNumber}
                            </Link>
                            <div className="text-xs text-muted-foreground">{formatDate(l.issueDate)}</div>
                          </TD>
                          <TD>{l.customerName}</TD>
                          <TD className="text-muted-foreground">{l.memberName}</TD>
                          <TD className="tabular text-right">{formatJPY(l.subtotal)}</TD>
                          <TD>
                            <Badge tone={l.paid ? "success" : "warning"}>
                              {l.paid ? "入金済" : `未入金（${invoiceStatusLabels[l.status]}）`}
                            </Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
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

          <Card>
            <CardHeader>
              <CardTitle>紹介顧客（{attributed.length}件）</CardTitle>
            </CardHeader>
            <CardContent>
              {attributed.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  紹介顧客はまだありません。顧客詳細の「編集」から獲得代理店・営業マンを設定してください。
                </p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {attributed.map((c) => {
                    const member = members.find((m) => m.id === c.agencyMemberId);
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                        <Link href={`/customers/${c.id}`} className="font-medium text-primary hover:underline">
                          {c.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {member ? member.name : "担当なし"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
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
