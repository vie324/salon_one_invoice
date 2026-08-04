import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchItemResultBadge, BatchStatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import { formatDate, formatJPY } from "@/lib/utils";
import { DeleteRecordButton } from "@/components/records/delete-record-button";
import { ProcessBatchButton } from "./process-batch-button";

export const metadata = { title: "口座振替バッチ" };

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = await getServiceRepository();
  const batch = await repo.getBatch(id);
  if (!batch) notFound();
  const customers = await repo.listCustomers();
  const nameOf = (cid: string) => customers.find((c) => c.id === cid)?.name ?? "—";

  const total = batch.items.reduce((s, i) => s + i.amount, 0);
  const success = batch.items.filter((i) => i.result === "success");
  const failed = batch.items.filter((i) => i.result === "failed");

  return (
    <div>
      <Link
        href="/direct-debit"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        口座振替へ
      </Link>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold sm:text-2xl">{batch.name}</h1>
          <BatchStatusBadge status={batch.status} />
        </div>
        <span className="text-sm text-muted-foreground">
          引落予定日 {formatDate(batch.scheduledDate)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>対象明細（{batch.items.length}件）</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>顧客</TH>
                    <TH className="text-right">金額</TH>
                    <TH>結果</TH>
                    <TH>備考</TH>
                  </TR>
                </THead>
                <TBody>
                  {batch.items.map((item) => (
                    <TR key={item.id}>
                      <TD className="font-medium">
                        <Link href={`/invoices/${item.invoiceId}`} className="hover:text-primary hover:underline">
                          {nameOf(item.customerId)}
                        </Link>
                      </TD>
                      <TD className="tabular text-right">{formatJPY(item.amount)}</TD>
                      <TD>
                        <BatchItemResultBadge result={item.result} />
                      </TD>
                      <TD className="text-xs text-muted-foreground">{item.resultReason || "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>サマリ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="合計金額" value={formatJPY(total)} />
              <Row label="件数" value={`${batch.items.length}件`} />
              {batch.status === "completed" && (
                <>
                  <Row label="成功" value={`${success.length}件（${formatJPY(success.reduce((s, i) => s + i.amount, 0))}）`} />
                  <Row label="失敗" value={`${failed.length}件`} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>操作</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <a href={`/api/direct-debit/${batch.id}/csv`} className={buttonClasses({ variant: "outline", className: "w-full" })}>
                <Download className="h-4 w-4" />
                収納代行用CSVを出力
              </a>
              {batch.status !== "completed" && <ProcessBatchButton id={batch.id} />}
              <div className="border-t border-border pt-2">
                <DeleteRecordButton
                  entity="batch"
                  id={batch.id}
                  label={`${batch.name}（引落予定 ${batch.scheduledDate}）`}
                  redirectTo="/direct-debit"
                  className="w-full text-muted-foreground hover:text-destructive"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  );
}
