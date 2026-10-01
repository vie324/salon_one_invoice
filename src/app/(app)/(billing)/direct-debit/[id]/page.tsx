import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteRecordButton } from "@/components/records/delete-record-button";
import { BatchItemResultBadge, BatchStatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import { cn, formatDate, formatJPY, toISODate } from "@/lib/utils";
import { MarkSubmittedButton, ResultsForm } from "./batch-client";

export const metadata = { title: "NSS引き落としの一覧" };
export const dynamic = "force-dynamic";

const STEPS = ["① 一覧の確認", "② NSSへ登録", "③ 結果の反映"] as const;

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getServiceRepository();
  const batch = await repo.getBatch(id);
  if (!batch) notFound();
  const [customers, invoices, mandates] = await Promise.all([
    repo.listCustomers(),
    repo.listInvoices({ paymentMethod: "direct_debit" }),
    repo.listMandates(),
  ]);
  const customerOf = (cid: string) => customers.find((c) => c.id === cid);
  const invoiceOf = (iid: string) => invoices.find((i) => i.id === iid);
  const mandateOf = (cid: string) => mandates.find((m) => m.customerId === cid);

  const total = batch.items.reduce((s, i) => s + i.amount, 0);
  const success = batch.items.filter((i) => i.result === "success");
  const failed = batch.items.filter((i) => i.result === "failed");
  const pendingItems = batch.items.filter((i) => i.result === "pending");
  const step = batch.status === "draft" ? 0 : batch.status === "completed" ? 3 : 2;
  const beforeDebit = toISODate(new Date()) < batch.scheduledDate;

  return (
    <div>
      <Link
        href={`/direct-debit?month=${batch.scheduledDate.slice(0, 7)}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        NSS引き落としへ
      </Link>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold sm:text-2xl">{batch.name}</h1>
          <BatchStatusBadge status={batch.status} />
        </div>
        <span className="text-sm text-muted-foreground">引き落とし日 {formatDate(batch.scheduledDate)}</span>
      </div>

      <ol className="mb-5 grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "rounded-md border px-3 py-2 text-center text-xs font-medium sm:text-sm",
              i < step && "border-success/40 bg-success/10 text-success",
              i === step && "border-primary bg-primary text-primary-foreground",
              i > step && "border-border bg-card text-muted-foreground",
              step === 3 && "border-success/40 bg-success/10 text-success",
            )}
          >
            {i < step || step === 3 ? "✓ " : ""}
            {label}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>対象（{batch.items.length}件・{formatJPY(total)}）</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>お客様</TH>
                    <TH>請求</TH>
                    <TH>NSS顧客番号</TH>
                    <TH className="text-right">金額</TH>
                    <TH>結果</TH>
                    <TH>理由</TH>
                  </TR>
                </THead>
                <TBody>
                  {batch.items.map((item) => {
                    const inv = invoiceOf(item.invoiceId);
                    return (
                      <TR key={item.id}>
                        <TD primary className="font-medium">
                          <Link href={`/customers/${item.customerId}`} className="hover:text-primary hover:underline">
                            {customerOf(item.customerId)?.name ?? "—"}
                          </Link>
                        </TD>
                        <TD>
                          <Link href={`/invoices/${item.invoiceId}`} className="tabular text-primary hover:underline">
                            {inv?.invoiceNumber ?? "請求書"}
                          </Link>
                        </TD>
                        <TD className="tabular text-xs text-muted-foreground">
                          {mandateOf(item.customerId)?.nssCustomerNumber || "—"}
                        </TD>
                        <TD className="tabular text-right">{formatJPY(item.amount)}</TD>
                        <TD>
                          <BatchItemResultBadge result={item.result} />
                        </TD>
                        <TD className="text-xs text-muted-foreground">{item.resultReason || "—"}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>② NSSへ登録</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <a
                href={`/api/direct-debit/${batch.id}/csv`}
                className={buttonClasses({ variant: "outline", className: "w-full" })}
              >
                <Download className="h-4 w-4" />
                NSS登録用の一覧（CSV・確認用）
              </a>
              <p className="text-xs text-muted-foreground">
                顧客コード・NSS顧客番号・お客様名・金額・引き落とし日の一覧です。これを見ながら NSS の収納サイト（収納リンク）へ確定金額を登録します。口座番号は含みません。
              </p>
              {batch.status === "draft" ? (
                <MarkSubmittedButton id={batch.id} />
              ) : (
                <p className="rounded-md bg-success/10 px-3 py-2 text-xs text-success">NSS へ登録済みです。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>③ 結果の反映</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {batch.status === "draft" ? (
                <p className="text-xs text-muted-foreground">NSS へ登録したあと、引き落とし日以降に結果を反映します。</p>
              ) : (
                <>
                  {beforeDebit && pendingItems.length > 0 && (
                    <p className="text-xs text-warning">
                      引き落とし日（{formatDate(batch.scheduledDate)}）の前です。NSS の振替結果が出てから反映してください。
                    </p>
                  )}
                  <ResultsForm
                    id={batch.id}
                    rows={pendingItems.map((i) => ({
                      itemId: i.id,
                      customerName: customerOf(i.customerId)?.name ?? "—",
                      invoiceNumber: invoiceOf(i.invoiceId)?.invoiceNumber ?? "",
                      amount: i.amount,
                    }))}
                  />
                </>
              )}
              {(success.length > 0 || failed.length > 0) && (
                <div className="space-y-1 border-t border-border pt-3 text-sm">
                  <Row label="引き落とし済" value={`${success.length}件（${formatJPY(success.reduce((s, i) => s + i.amount, 0))}）`} />
                  <Row label="引き落とし不可" value={`${failed.length}件`} />
                  {failed.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      不可の請求は「引落失敗」になり、NSS引き落とし画面の「要フォロー」に出ます。振込に切り替えて請求書を送ってください。
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {batch.status === "draft" && (
            <div className="px-1">
              <DeleteRecordButton
                entity="batch"
                id={batch.id}
                label={`${batch.name}（引き落とし日 ${batch.scheduledDate}）`}
                redirectTo="/direct-debit"
                className="w-full text-muted-foreground hover:text-destructive"
              />
            </div>
          )}
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
