import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Mail,
  MapPin,
  Phone,
  User,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicationStatusBadge, InvoiceStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServiceRepository } from "@/lib/data";
import { invoiceTypeLabels } from "@/lib/domain/constants";
import { applicationBillingLookup, newInvoiceHref } from "@/lib/orders/application-billing";
import { loadOrderBook } from "@/lib/orders/load";
import { formatDate, formatDateTime, formatJPY } from "@/lib/utils";
import { ApplicationActions, CredentialsPanel } from "./application-detail-client";

export const metadata = { title: "申込の詳細" };

export const dynamic = "force-dynamic";

/** 「請求書・入金」に並べる件数(それ以上は顧客の画面で) */
const INVOICE_LIMIT = 8;

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getServiceRepository();
  const [app, book] = await Promise.all([
    repo.getApplication(id),
    // 顧客が実在するか・請求書と入金の状況を出すため、受注管理と同じ集計を読む
    loadOrderBook(repo, { sync: false }),
  ]);
  if (!app) notFound();
  const billing = applicationBillingLookup(book)(app);
  const customer = billing.row?.customer ?? null;
  // 登録した顧客を削除していたら、ゴミ箱での名前を出す(戻すときに探しやすいように)
  const deletedCustomer =
    billing.state === "deleted"
      ? ((await repo.listDeletedRecords()).find(
          (r) => r.entity === "customer" && r.id === app.customerId,
        ) ?? null)
      : null;

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/applications"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          申込・契約URLへ
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">
            {app.linkName ? `申込URL: ${app.linkName}` : "申込"}
          </div>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight sm:text-2xl">{app.companyName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ApplicationStatusBadge status={billing.display} />
            {app.contractId && <Badge tone="success">契約締結済</Badge>}
            {app.lineRequested ? (
              <Badge tone="success">LINE連携 申込あり</Badge>
            ) : (
              <Badge tone="neutral">LINE連携 なし</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              受付 {formatDateTime(app.submittedAt)}
            </span>
          </div>
        </div>
        <ApplicationActions
          applicationId={app.id}
          companyName={app.companyName}
          status={app.status}
          customerState={billing.state}
          customerId={customer?.id ?? null}
          invoiceHref={customer ? newInvoiceHref(customer.id, billing) : null}
          awaitingConfirm={billing.awaitingConfirm}
        />
      </div>

      {billing.state === "deleted" && (
        <div className="mb-6 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium">
              この申込から登録した顧客
              {deletedCustomer ? `（${deletedCustomer.label}）` : ""}は削除されています。
            </p>
            <p className="text-xs text-muted-foreground">
              ゴミ箱から元に戻すと、これまでの請求書・受注管理の案件をそのまま使えます。
              新しく登録し直す場合は「もう一度顧客として登録」（請求書も作るなら「登録し直して請求書を作成」）を押してください（ゴミ箱の顧客とは別の顧客になります）。
            </p>
            <Link href="/trash" className="inline-block text-xs text-primary hover:underline">
              ゴミ箱を開く →
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>申込内容</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Row icon={<Building2 className="h-4 w-4" />} label="法人名（個人の場合、個人名）">
                {app.companyName}
              </Row>
              <Row icon={<MapPin className="h-4 w-4" />} label="住所（法人の場合、登記住所）">
                {app.address || "—"}
              </Row>
              <Row icon={<User className="h-4 w-4" />} label="代表者">
                {[app.representativeTitle, app.representativeName].filter(Boolean).join(" ") || "—"}
              </Row>
              <Row icon={<UserRound className="h-4 w-4" />} label="ご担当者名">
                {app.contactName || (
                  <span className="text-muted-foreground">代表者と同じ</span>
                )}
              </Row>
              <Row icon={<Phone className="h-4 w-4" />} label="電話番号">
                {app.phone ? (
                  <a href={`tel:${app.phone}`} className="text-primary hover:underline">
                    {app.phone}
                  </a>
                ) : (
                  "—"
                )}
              </Row>
              <Row icon={<Mail className="h-4 w-4" />} label="メールアドレス">
                {app.email ? (
                  <a href={`mailto:${app.email}`} className="text-primary hover:underline">
                    {app.email}
                  </a>
                ) : (
                  "—"
                )}
              </Row>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle>請求書・入金</CardTitle>
              {customer && !billing.awaitingConfirm && (
                <Link
                  href={newInvoiceHref(customer.id, billing)}
                  className={buttonClasses({ size: "sm", variant: "outline" })}
                >
                  請求書を作成
                </Link>
              )}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {billing.state !== "registered" ? (
                <p className="text-muted-foreground">
                  {billing.state === "deleted"
                    ? "登録した顧客が削除されているため、請求書を作成できません。ゴミ箱から戻すか、「登録し直して請求書を作成」を押してください。"
                    : "まだ顧客として登録されていません。「顧客登録して請求書を作成」を押すと、申込内容のまま顧客を登録して請求書の作成画面を開きます。"}
                </p>
              ) : (
                <>
                  {billing.awaitingConfirm && (
                    <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs">
                      <p>
                        契約書が締結済みで、受注確定（請求の開始）を待っています。
                        初回請求書（初期費用＋初月日割り）は、受注管理の「受注を確定する」で作ると契約どおりの金額で作成され、
                        毎月の請求（定期契約）もまとめて登録されます。
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link
                          href={`/orders/${customer!.id}`}
                          className={buttonClasses({ size: "sm" })}
                        >
                          受注管理で受注を確定する
                        </Link>
                        <Link
                          href={`/invoices/new?customer=${customer!.id}`}
                          className={buttonClasses({ size: "sm", variant: "outline" })}
                        >
                          ほかの請求書を作成
                        </Link>
                      </div>
                    </div>
                  )}
                  {billing.invoices.length === 0 ? (
                    <p className="text-muted-foreground">まだ請求書がありません。</p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        請求書 {billing.invoices.length}件
                        {billing.unpaidCount > 0
                          ? `・未入金 ${formatJPY(billing.unpaidAmount)}（${billing.unpaidCount}件）`
                          : billing.draftCount > 0
                            ? `・下書き ${billing.draftCount}件（未送付）`
                            : "・すべて入金済み"}
                      </p>
                      <ul className="divide-y divide-border rounded-md border border-border">
                        {billing.invoices.slice(0, INVOICE_LIMIT).map((inv) => (
                          <li key={inv.id}>
                            <Link
                              href={`/invoices/${inv.id}`}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50"
                            >
                              <span className="min-w-0">
                                <span className="tabular font-medium text-primary">
                                  {inv.invoiceNumber}
                                </span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {invoiceTypeLabels[inv.type]}・発行 {formatDate(inv.issueDate)}・期限{" "}
                                  {formatDate(inv.dueDate)}
                                </span>
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="tabular">{formatJPY(inv.total)}</span>
                                <InvoiceStatusBadge status={inv.status} />
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {billing.invoices.length > INVOICE_LIMIT && (
                        <Link
                          href={`/customers/${customer!.id}`}
                          className="inline-block text-xs text-primary hover:underline"
                        >
                          すべての請求書を顧客の画面で見る →
                        </Link>
                      )}
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <CredentialsPanel applicationId={app.id} application={app} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>受付情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Meta label="受付日時" value={formatDateTime(app.submittedAt)} />
              <Meta label="申込URL" value={app.linkName || "—"} />
              <Meta label="送信元IP" value={app.submittedIp || "—"} />
              <Meta label="LINE連携申込" value={app.lineRequested ? "あり" : "なし"} />
              <Meta
                label="契約"
                value={app.contractId ? "申込と同時に電子署名済み" : "申込のみ（契約書は別途送付）"}
              />
              <div>
                <div className="text-xs text-muted-foreground">顧客</div>
                <div className="mt-0.5">
                  {customer ? (
                    <div className="space-y-1">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="block font-medium text-primary hover:underline"
                      >
                        {customer.code} {customer.name}
                      </Link>
                      <Link
                        href={`/orders/${customer.id}`}
                        className="block text-xs text-primary hover:underline"
                      >
                        受注管理の案件ページを開く →
                      </Link>
                    </div>
                  ) : billing.state === "deleted" ? (
                    <span className="text-destructive">
                      削除済み{deletedCustomer ? `（${deletedCustomer.label}）` : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">未登録</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 break-words text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words">{value}</div>
    </div>
  );
}
