import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServiceRepository } from "@/lib/data";
import { outstandingAmount } from "@/lib/domain/calculations";
import { paymentMethodLabels } from "@/lib/domain/constants";
import type { InvoiceRevision } from "@/lib/domain/types";
import { formatDate, formatDateTime, formatJPY } from "@/lib/utils";
import { DeleteRecordButton } from "@/components/records/delete-record-button";
import { invoiceEditBlockedReason } from "@/lib/domain/invoice-edit";
import { EditInvoiceItemsButton } from "./edit-items-dialog";
import { InvoiceActions } from "./invoice-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getServiceRepository();
  const inv = await repo.getInvoice(id);
  return { title: inv ? `請求書 ${inv.invoiceNumber}` : "請求書" };
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getServiceRepository();
  const invoice = await repo.getInvoice(id);
  if (!invoice) notFound();

  const [org, payments, batches, revisions] = await Promise.all([
    repo.getOrganization(),
    repo.listPayments({ customerId: invoice.customerId }),
    repo.listBatches(),
    repo.listInvoiceRevisions(id),
  ]);
  // NSS引き落としの一覧に入っている請求書は、明細を修正できない(登録した金額と食い違うため)
  const inDirectDebitList = batches.some((b) => b.items.some((item) => item.invoiceId === id));
  const editBlocked = invoiceEditBlockedReason(invoice, inDirectDebitList);
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
              <div className="mb-2">
                <EditInvoiceItemsButton
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.invoiceNumber}
                  type={invoice.type}
                  items={invoice.items}
                  notes={invoice.notes}
                  blockedReason={editBlocked}
                />
              </div>
              <InvoiceActions
                id={invoice.id}
                customerId={invoice.customerId}
                status={invoice.status}
                total={invoice.total}
                amountPaid={invoice.amountPaid}
                paymentMethod={invoice.paymentMethod}
              />
              <div className="mt-2 border-t border-border pt-2">
                <DeleteRecordButton
                  entity="invoice"
                  id={invoice.id}
                  label={`請求書 ${invoice.invoiceNumber}（${invoice.customer?.name ?? ""}）`}
                  redirectTo="/invoices"
                  className="w-full text-muted-foreground hover:text-destructive"
                />
              </div>
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
              {(invoice.reminderCount ?? 0) > 0 && (
                <Row
                  label="督促メール"
                  value={`${invoice.reminderCount}回（最終 ${formatDate(invoice.lastReminderAt)}）`}
                  muted
                />
              )}
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

          {revisions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>修正履歴（{revisions.length}件）</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {revisions.map((r) => (
                    <RevisionEntry key={r.id} revision={r} />
                  ))}
                </ul>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  直す前の明細・金額はここに残ります（消せません）。
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** 修正履歴の1件(いつ・誰が・なぜ・いくらからいくらへ。直す前と後の明細は開いて見る) */
function RevisionEntry({ revision: r }: { revision: InvoiceRevision }) {
  return (
    <li className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="tabular text-xs text-muted-foreground">{formatDateTime(r.revisedAt)}</span>
        <span className="text-xs text-muted-foreground">{r.actor || "—"}</span>
      </div>
      <div className="mt-1 font-medium">{r.reason || "（理由の記録なし）"}</div>
      <div className="tabular mt-0.5 text-xs">
        合計 {formatJPY(r.beforeTotal)} → <span className="font-semibold">{formatJPY(r.afterTotal)}</span>（税込）
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-primary">明細を見る</summary>
        <div className="mt-2 space-y-2">
          <RevisionItems title="直す前" items={r.beforeItems} />
          <RevisionItems title="直した後" items={r.afterItems} />
          {r.beforeNotes && (
            <div>
              <div className="font-medium text-muted-foreground">直す前の備考</div>
              <p className="whitespace-pre-wrap">{r.beforeNotes}</p>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

function RevisionItems({ title, items }: { title: string; items: InvoiceRevision["beforeItems"] }) {
  return (
    <div>
      <div className="font-medium text-muted-foreground">{title}</div>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="min-w-0">{it.description}</span>
            <span className="tabular shrink-0 text-right">
              {formatJPY(it.unitPrice)} × {it.quantity} = {formatJPY(it.amount)}
            </span>
          </li>
        ))}
      </ul>
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
