import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRepository } from "@/lib/data";
import { outstandingAmount } from "@/lib/domain/calculations";
import { paymentMethodLabels } from "@/lib/domain/constants";
import { formatDate, formatJPY } from "@/lib/utils";
import { InvoiceActions } from "./invoice-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getRepository();
  const inv = await repo.getInvoice(id);
  return { title: inv ? `請求書 ${inv.invoiceNumber}` : "請求書" };
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getRepository();
  const invoice = await repo.getInvoice(id);
  if (!invoice) notFound();

  const [org, payments] = await Promise.all([
    repo.getOrganization(),
    repo.listPayments({ customerId: invoice.customerId }),
  ]);
  const invoicePayments = payments.filter((p) => p.invoiceId === id);
  const outstanding = outstandingAmount(invoice);

  return (
    <div>
      <Link
        href="/invoices"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        請求書一覧へ
      </Link>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="tabular text-xl font-bold sm:text-2xl">{invoice.invoiceNumber}</h1>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
        <Link
          href={`/customers/${invoice.customerId}`}
          className="text-sm text-primary hover:underline"
        >
          {invoice.customer?.name} の顧客ページ →
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <InvoiceDocument invoice={invoice} customer={invoice.customer} org={org} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>操作</CardTitle>
            </CardHeader>
            <CardContent>
              <InvoiceActions
                id={invoice.id}
                customerId={invoice.customerId}
                status={invoice.status}
                total={invoice.total}
                amountPaid={invoice.amountPaid}
                paymentMethod={invoice.paymentMethod}
                hasEmail={Boolean(invoice.customer?.email)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>入金状況</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="請求額" value={formatJPY(invoice.total)} />
              <Row label="入金済" value={formatJPY(invoice.amountPaid)} />
              <div className="border-t border-border pt-2">
                <Row
                  label="未収残高"
                  value={formatJPY(outstanding)}
                  emphasize={outstanding > 0}
                />
              </div>
              <Row label="支払方法" value={paymentMethodLabels[invoice.paymentMethod]} muted />
              {invoice.sentAt && <Row label="送付日" value={formatDate(invoice.sentAt)} muted />}
              {invoice.paidAt && <Row label="入金日" value={formatDate(invoice.paidAt)} muted />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>入金履歴</CardTitle>
            </CardHeader>
            <CardContent>
              {invoicePayments.length > 0 ? (
                <ul className="space-y-2.5">
                  {invoicePayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium">{formatJPY(p.amount)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(p.paidAt)} ・ {paymentMethodLabels[p.method as keyof typeof paymentMethodLabels] ?? "調整"}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{p.reference}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">入金の記録はまだありません。</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  emphasize,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span className={`tabular font-medium ${emphasize ? "text-warning" : ""}`}>{value}</span>
    </div>
  );
}
