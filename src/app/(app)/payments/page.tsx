import { CircleDollarSign, Wallet } from "lucide-react";
import Link from "next/link";
import { suggestMatches } from "@/lib/bank/csv";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getRepository } from "@/lib/data";
import { outstandingAmount } from "@/lib/domain/calculations";
import { paymentMethodLabels } from "@/lib/domain/constants";
import { formatDate, formatJPY } from "@/lib/utils";
import { ReconcileClient, type OpenInvoiceOption, type TxnRow } from "./reconcile-client";

export const metadata = { title: "入金確認" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const repo = await getRepository();
  const [payments, bankTxns, invoices, metrics, customers] = await Promise.all([
    repo.listPayments(),
    repo.listBankTransactions(),
    repo.listInvoices(),
    repo.getDashboardMetrics(),
    repo.listCustomers(),
  ]);

  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? "—";
  const invoiceNo = (id: string | null) =>
    id ? invoices.find((i) => i.id === id)?.invoiceNumber ?? "—" : null;

  const openInvoices = invoices.filter(
    (i) => outstandingAmount(i) > 0 && i.status !== "draft" && i.status !== "canceled",
  );
  const suggestions = suggestMatches(bankTxns, invoices);
  const suggestionMap = new Map(suggestions.map((s) => [s.txnId, s]));

  const unmatched: TxnRow[] = bankTxns
    .filter((t) => !t.matchedInvoiceId)
    .map((t) => {
      const sug = suggestionMap.get(t.id);
      return {
        id: t.id,
        transactionDate: t.transactionDate,
        amount: t.amount,
        payerName: t.payerName,
        description: t.description,
        suggestedInvoiceId: sug?.invoiceId ?? null,
        suggestionReason: sug?.reason ?? null,
      };
    });

  const openOptions: OpenInvoiceOption[] = openInvoices.map((i) => ({
    id: i.id,
    label: `${i.customer?.name} / ${i.invoiceNumber} / ${formatJPY(outstandingAmount(i))}`,
  }));

  const matchedCount = bankTxns.filter((t) => t.matchedInvoiceId).length;

  return (
    <div>
      <PageHeader
        title="入金確認"
        description="口座振替・振込の入金を確認し、請求書に消し込みます。初期費用など単発入金の確認にも対応。"
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="今月の入金額"
          value={formatJPY(metrics.monthCollected)}
          icon={<CircleDollarSign className="h-5 w-5" />}
          accent="success"
        />
        <StatCard label="未収金" value={formatJPY(metrics.outstanding)} accent="warning" />
        <StatCard label="未消込の入金" value={`${unmatched.length}件`} accent="danger" />
        <StatCard label="消込済" value={`${matchedCount}件`} icon={<Wallet className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>入金の消込</CardTitle>
          </CardHeader>
          <CardContent>
            <ReconcileClient unmatched={unmatched} openInvoices={openOptions} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>入金履歴</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>入金日</TH>
                  <TH>顧客</TH>
                  <TH className="text-right">金額</TH>
                  <TH>方法</TH>
                </TR>
              </THead>
              <TBody>
                {payments.slice(0, 12).map((p) => (
                  <TR key={p.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDate(p.paidAt)}</TD>
                    <TD>
                      <div className="font-medium">{nameOf(p.customerId)}</div>
                      {invoiceNo(p.invoiceId) && (
                        <Link
                          href={`/invoices/${p.invoiceId}`}
                          className="text-xs text-muted-foreground hover:text-primary"
                        >
                          {invoiceNo(p.invoiceId)}
                        </Link>
                      )}
                    </TD>
                    <TD className="tabular text-right font-medium">{formatJPY(p.amount)}</TD>
                    <TD>
                      <Badge tone="neutral">
                        {paymentMethodLabels[p.method as keyof typeof paymentMethodLabels] ?? "調整"}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
