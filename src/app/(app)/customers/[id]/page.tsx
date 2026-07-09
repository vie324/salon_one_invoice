import { ArrowLeft, Mail, MapPin, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { MandateStatusBadge, SubscriptionStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRepository } from "@/lib/data";
import { paymentMethodLabels } from "@/lib/domain/constants";
import { formatDate, formatJPY, maskAccount } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const c = await repo.getCustomer(id);
  return { title: c ? c.name : "顧客" };
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getRepository();
  const customer = await repo.getCustomer(id);
  if (!customer) notFound();

  const [mandate, subscriptions, plans, invoices, payments] = await Promise.all([
    repo.getMandateByCustomer(id),
    repo.listSubscriptions(),
    repo.listPlans(),
    repo.listInvoices({ customerId: id }),
    repo.listPayments({ customerId: id }),
  ]);
  const subscription = subscriptions.find((s) => s.customerId === id);
  const plan = subscription ? plans.find((p) => p.id === subscription.planId) : null;
  const outstanding = invoices
    .filter((i) => !["paid", "canceled", "draft"].includes(i.status))
    .reduce((s, i) => s + (i.total - i.amountPaid), 0);

  return (
    <div>
      <Link
        href="/customers"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        顧客一覧へ
      </Link>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/12 text-lg font-bold text-primary">
            {customer.name.slice(0, 1)}
          </div>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">{customer.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="tabular">{customer.code}</span>
              <span>・</span>
              <span>{customer.kana}</span>
              <Badge tone={customer.status === "active" ? "success" : "neutral"} dot>
                {customer.status === "active" ? "稼働中" : "休止"}
              </Badge>
            </div>
          </div>
        </div>
        <Link
          href={`/invoices/new?customer=${customer.id}`}
          className={buttonClasses({ size: "sm" })}
        >
          <Plus className="h-4 w-4" />
          請求書を作成
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>請求書</CardTitle>
              <span className="text-sm text-muted-foreground">
                未収 <span className="tabular font-semibold text-warning">{formatJPY(outstanding)}</span>
              </span>
            </CardHeader>
            <CardContent>
              <InvoiceTable invoices={invoices} hideCustomer />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>入金履歴</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length > 0 ? (
                <ul className="divide-y divide-border">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <span className="tabular font-medium">{formatJPY(p.amount)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {paymentMethodLabels[p.method as keyof typeof paymentMethodLabels] ?? "調整"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(p.paidAt)} ・ {p.reference || "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">入金の記録はまだありません。</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>連絡先</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <InfoRow icon={<Mail className="h-4 w-4" />} value={customer.email || "—"} />
              <InfoRow icon={<Phone className="h-4 w-4" />} value={customer.phone || "—"} />
              <InfoRow
                icon={<MapPin className="h-4 w-4" />}
                value={`${customer.postalCode ? "〒" + customer.postalCode + " " : ""}${customer.address || "—"}`}
              />
              <div className="border-t border-border pt-2.5 text-muted-foreground">
                支払方法： {paymentMethodLabels[customer.paymentMethod]}
                <br />
                社内担当： {customer.assignee || "—"}
              </div>
              {customer.notes && (
                <p className="rounded-md bg-muted px-3 py-2 text-xs">{customer.notes}</p>
              )}
            </CardContent>
          </Card>

          {customer.paymentMethod === "direct_debit" && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>口座振替</CardTitle>
                {mandate && <MandateStatusBadge status={mandate.status} />}
              </CardHeader>
              <CardContent className="text-sm">
                {mandate ? (
                  <div className="space-y-1.5 text-muted-foreground">
                    <div>{mandate.bankName} {mandate.branchName}</div>
                    <div>
                      {mandate.accountType} {maskAccount(mandate.accountNumber)}
                    </div>
                    <div>{mandate.accountHolderKana}</div>
                    {mandate.registeredAt && (
                      <div className="text-xs">登録日: {formatDate(mandate.registeredAt)}</div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">口座振替の登録がありません。</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>定期契約</CardTitle>
              {subscription && <SubscriptionStatusBadge status={subscription.status} />}
            </CardHeader>
            <CardContent className="text-sm">
              {subscription && plan ? (
                <div className="space-y-1.5">
                  <div className="font-medium">{plan.name}</div>
                  <div className="tabular text-muted-foreground">{formatJPY(plan.amount)} / 月（税抜）</div>
                  <div className="text-xs text-muted-foreground">
                    次回請求: {formatDate(subscription.nextBillingDate)}（毎月{subscription.billingDay}日）
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">定期契約はありません。</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-muted-foreground">{icon}</span>
      <span>{value}</span>
    </div>
  );
}
