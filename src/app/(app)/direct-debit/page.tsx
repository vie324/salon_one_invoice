import { ArrowRight, Landmark, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { BatchStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { paymentProvider } from "@/lib/config";
import { getRepository } from "@/lib/data";
import { formatDate, formatJPY } from "@/lib/utils";
import { CreateBatchButton } from "./create-batch-button";

export const metadata = { title: "口座振替" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function DirectDebitPage() {
  const repo = await getRepository();
  const [batches, invoices, customers] = await Promise.all([
    repo.listBatches(),
    repo.listInvoices({ paymentMethod: "direct_debit" }),
    repo.listCustomers(),
  ]);

  const batchedIds = new Set(batches.flatMap((b) => b.items.map((i) => i.invoiceId)));
  const awaiting = invoices.filter(
    (i) =>
      (i.status === "awaiting_payment" || i.status === "sent") &&
      i.amountPaid < i.total &&
      !batchedIds.has(i.id),
  );
  const awaitingAmount = awaiting.reduce((s, i) => s + (i.total - i.amountPaid), 0);

  const mandates = await Promise.all(customers.map((c) => repo.getMandateByCustomer(c.id)));
  const activeMandates = mandates.filter((m) => m?.status === "active").length;
  const pendingMandates = mandates.filter((m) => m?.status === "pending" || m?.status === "failed").length;

  return (
    <div>
      <PageHeader
        title="口座振替（引き落とし）"
        description="入金待ちの口座振替請求をバッチにまとめ、収納代行向けCSVを出力・処理します。"
        actions={<CreateBatchButton awaitingCount={awaiting.length} />}
      />

      <div className="mb-4 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <ShieldCheck className="h-4 w-4 text-info" />
          決済プロバイダ: {paymentProvider === "stripe" ? "Stripe" : "手動 / 収納代行（CSV連携）"}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          既定は収納代行向けのCSV出力＋入金確認です。GMO・SMBC等の収納代行やStripe自動引き落としは、
          アダプタを差し替えるだけで有効化できます。
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="未バッチの振替"
          value={`${awaiting.length}件`}
          sub={formatJPY(awaitingAmount)}
          icon={<Landmark className="h-5 w-5" />}
          accent="warning"
        />
        <StatCard label="振替登録済" value={`${activeMandates}名`} accent="success" />
        <StatCard label="要対応の口座" value={`${pendingMandates}名`} sub="手続き中・失敗" accent="danger" />
        <StatCard label="バッチ数" value={`${batches.length}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>振替バッチ</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <EmptyState title="バッチがありません" description="入金待ちの口座振替請求からバッチを作成できます。" />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>バッチ名</TH>
                  <TH>引落予定日</TH>
                  <TH className="text-right">件数</TH>
                  <TH className="text-right">金額</TH>
                  <TH>結果</TH>
                  <TH>状態</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {batches.map((b) => {
                  const total = b.items.reduce((s, i) => s + i.amount, 0);
                  const success = b.items.filter((i) => i.result === "success").length;
                  const failed = b.items.filter((i) => i.result === "failed").length;
                  return (
                    <TR key={b.id}>
                      <TD className="font-medium">
                        <Link href={`/direct-debit/${b.id}`} className="hover:text-primary hover:underline">
                          {b.name}
                        </Link>
                      </TD>
                      <TD className="text-muted-foreground">{formatDate(b.scheduledDate)}</TD>
                      <TD className="tabular text-right">{b.items.length}</TD>
                      <TD className="tabular text-right">{formatJPY(total)}</TD>
                      <TD className="text-xs">
                        {b.status === "completed" ? (
                          <span>
                            <span className="text-success">成功 {success}</span>
                            {failed > 0 && <span className="text-destructive"> / 失敗 {failed}</span>}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD>
                        <BatchStatusBadge status={b.status} />
                      </TD>
                      <TD>
                        <Link
                          href={`/direct-debit/${b.id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          詳細 <ArrowRight className="h-3 w-3" />
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
