import { ArrowRight, ChevronLeft, ChevronRight, Landmark, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { BatchStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import { NSS_CONFIRMATION_DAYS } from "@/lib/domain/constants";
import {
  classifyDebitInvoices,
  debitDateFor,
  defaultDebitMonth,
  nssStage,
  nssStageLabels,
  type NssStage,
} from "@/lib/domain/nss";
import { addMonths, formatDate, formatJPY } from "@/lib/utils";
import { CreateBatchButton, SwitchToTransferButton } from "./debit-client";

export const metadata = { title: "NSS引き落とし" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

const STAGE_TONE: Record<NssStage, "neutral" | "warning" | "info" | "success" | "danger"> = {
  not_started: "neutral",
  form_sent: "info",
  form_received: "warning",
  submitted: "info",
  active: "success",
  failed: "danger",
  revoked: "neutral",
};

/**
 * NSS(日本システム収納)での口座振替の管理。
 *
 * 口座情報は NSS で管理し、このツールでは「誰が NSS 登録済みか」と
 * 「毎月 NSS に登録する金額」「NSS から返ってきた結果」だけを扱う。
 */
export default async function DirectDebitPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : defaultDebitMonth();
  const repo = await getServiceRepository();
  const [batches, invoices, customers, mandates] = await Promise.all([
    repo.listBatches(),
    repo.listInvoices({ paymentMethod: "direct_debit" }),
    repo.listCustomers(),
    repo.listMandates(),
  ]);

  const { ready, blocked, failed } = classifyDebitInvoices({ invoices, mandates, batches, month });
  const readyAmount = ready.reduce((s, c) => s + c.amount, 0);
  const debitDate = debitDateFor(month);
  const monthBatches = batches.filter((b) => b.scheduledDate.slice(0, 7) === month);
  const inConfirmation = ready.filter((c) => c.confirmUntil).length;

  // 口座振替の登録状況(口座振替のお客様のみ)
  const ddCustomers = customers.filter((c) => c.paymentMethod === "direct_debit" && c.status === "active");
  const stageRows = ddCustomers.map((c) => {
    const mandate = mandates.find((m) => m.customerId === c.id) ?? null;
    return { customer: c, mandate, stage: nssStage(mandate) };
  });
  const activeCount = stageRows.filter((r) => r.stage === "active").length;
  const inProgress = stageRows
    .filter((r) => r.stage !== "active" && r.stage !== "revoked")
    .sort((a, b) => order(a.stage) - order(b.stage));
  const [y, m] = month.split("-");

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0 sm:mb-0"
        title="NSS引き落とし（口座振替）"
        description="NSS（日本システム収納）での口座振替を、登録状況から毎月の引き落とし結果の反映まで管理します。口座番号などの口座情報は NSS で管理し、このツールでは持ちません。"
      />

      <div className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div>
          <div className="font-medium">NSS とこのツールの役割分担</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            NSS で行うこと: 口座情報の登録（収納サイト）・毎月の引き落とし金額の登録（収納リンク）・実際の引き落とし。
            このツールで行うこと: 依頼書の郵送〜登録完了の進み具合の記録・今月 NSS に登録する金額の一覧づくり・引き落とし結果を請求（入金済／要フォロー）へ反映。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={`${Number(m)}月に引き落とせる請求`}
          value={`${ready.length}件`}
          sub={formatJPY(readyAmount)}
          icon={<Landmark className="h-5 w-5" />}
          accent="primary"
        />
        <StatCard
          label="NSS未登録で引き落とせない"
          value={`${blocked.length}件`}
          sub="振込への切り替えが必要"
          accent={blocked.length > 0 ? "danger" : undefined}
        />
        <StatCard label="NSS登録完了のお客様" value={`${activeCount}名`} accent="success" />
        <StatCard
          label="手続き中のお客様"
          value={`${inProgress.length}名`}
          sub="依頼書の郵送〜登録完了待ち"
          accent={inProgress.length > 0 ? "warning" : undefined}
        />
      </div>

      {/* 今月の引き落とし */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>
              {y}年{Number(m)}月の引き落とし（引き落とし日 {formatDate(debitDate)}）
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              手順: ① 対象を確認 → ② NSS登録用の一覧を作って収納サイトへ登録 → ③ 引き落とし日のあと結果を反映
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href={`/direct-debit?month=${addMonths(month, -1)}`}
              className={buttonClasses({ variant: "outline", size: "sm" })}
              aria-label="前月"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="tabular px-1 text-sm font-medium">{month}</span>
            <Link
              href={`/direct-debit?month=${addMonths(month, 1)}`}
              className={buttonClasses({ variant: "outline", size: "sm" })}
              aria-label="翌月"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* ① 対象の確認 */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">① 引き落とせる請求（{ready.length}件・{formatJPY(readyAmount)}）</h3>
            {ready.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-sm text-muted-foreground">
                NSS へ登録する請求はありません（定期請求は毎月自動で作られます）。
              </p>
            ) : (
              <>
                {inConfirmation > 0 && (
                  <p className="mb-2 text-xs text-warning">
                    {inConfirmation}件はまだ確認期間中です（請求書の発行から{NSS_CONFIRMATION_DAYS}日）。お客様から修正の連絡がないか確認してから登録してください。
                  </p>
                )}
                <Table>
                  <THead>
                    <TR>
                      <TH>お客様</TH>
                      <TH>請求</TH>
                      <TH>NSS顧客番号</TH>
                      <TH className="text-right">金額</TH>
                      <TH>確認期間</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {ready.map((c) => (
                      <TR key={c.invoice.id}>
                        <TD primary>
                          <Link href={`/customers/${c.invoice.customerId}`} className="font-medium hover:text-primary hover:underline">
                            {c.invoice.customer?.name ?? "—"}
                          </Link>
                        </TD>
                        <TD>
                          <Link href={`/invoices/${c.invoice.id}`} className="tabular text-primary hover:underline">
                            {c.invoice.invoiceNumber}
                          </Link>
                          <div className="text-xs text-muted-foreground">{c.month}分</div>
                        </TD>
                        <TD className="tabular text-xs text-muted-foreground">{c.mandate?.nssCustomerNumber || "—"}</TD>
                        <TD className="tabular text-right">{formatJPY(c.amount)}</TD>
                        <TD className="text-xs">
                          {c.confirmUntil ? (
                            <span className="text-warning">{formatDate(c.confirmUntil)} まで</span>
                          ) : (
                            <span className="text-muted-foreground">確認済み</span>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <span className="text-xs text-muted-foreground">
                    ② 一覧を作ると、NSS登録用のCSV（確認用）を出力して「NSSへ登録した」を記録できます。
                  </span>
                  <CreateBatchButton
                    defaultDate={debitDate}
                    invoiceIds={ready.map((c) => c.invoice.id)}
                    count={ready.length}
                    amount={readyAmount}
                  />
                </div>
              </>
            )}
          </section>

          {/* 引き落とせない請求 */}
          {blocked.length > 0 && (
            <section className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-destructive">
                  NSS の登録が終わっていないため引き落とせない請求（{blocked.length}件）
                </h3>
                <SwitchToTransferButton invoiceIds={blocked.map((c) => c.invoice.id)} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                このままでは誰からも回収されません。振込に切り替えて請求書を送付してください（請求書の案内文も「お振込先」に変わります）。
              </p>
              <ul className="mt-2 divide-y divide-destructive/20 text-sm">
                {blocked.map((c) => (
                  <li key={c.invoice.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0">
                      <Link href={`/orders/${c.invoice.customerId}`} className="font-medium hover:underline">
                        {c.invoice.customer?.name ?? "—"}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{c.blockedReason}</span>
                    </span>
                    <Link href={`/invoices/${c.invoice.id}`} className="tabular text-xs text-primary hover:underline">
                      {c.invoice.invoiceNumber}・{formatJPY(c.amount)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* この月の一覧 */}
          {monthBatches.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">この月の引き落とし一覧</h3>
              <ul className="space-y-2">
                {monthBatches.map((b) => (
                  <li key={b.id}>
                    <Link
                      href={`/direct-debit/${b.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5 hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {b.name}
                        <BatchStatusBadge status={b.status} />
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {b.items.length}件・{formatJPY(b.items.reduce((s, i) => s + i.amount, 0))}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </CardContent>
      </Card>

      {/* 引き落とし不可(要フォロー) */}
      {failed.length > 0 && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-destructive">引き落とし不可（要フォロー）{failed.length}件</CardTitle>
            <SwitchToTransferButton invoiceIds={failed.map((i) => i.id)} label="すべて振込に切り替える" />
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              残高不足などで引き落とせなかった請求です。お客様へ連絡し、振込に切り替えて請求書（督促）を送ってください。
            </p>
            <ul className="divide-y divide-border text-sm">
              {failed.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/customers/${inv.customerId}`} className="font-medium hover:underline">
                    {inv.customer?.name ?? "—"}
                  </Link>
                  <Link href={`/invoices/${inv.id}`} className="tabular text-xs text-primary hover:underline">
                    {inv.invoiceNumber}・{formatJPY(inv.total - inv.amountPaid)}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 口座振替の登録状況 */}
      <Card>
        <CardHeader>
          <CardTitle>口座振替（NSS）の手続き中のお客様</CardTitle>
          <p className="text-xs text-muted-foreground">
            依頼書の郵送 → 回収 → NSSへ登録 → 登録完了 の記録は、受注管理の案件ページで行います。
          </p>
        </CardHeader>
        <CardContent>
          {inProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">手続き中のお客様はいません。</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>お客様</TH>
                  <TH>状況</TH>
                  <TH>最後の手続き</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {inProgress.map((r) => (
                  <TR key={r.customer.id}>
                    <TD primary className="font-medium">{r.customer.name}</TD>
                    <TD>
                      <Badge tone={STAGE_TONE[r.stage]}>{nssStageLabels[r.stage]}</Badge>
                    </TD>
                    <TD className="text-xs text-muted-foreground">
                      {r.mandate?.nssSubmittedOn
                        ? `NSSへ登録 ${formatDate(r.mandate.nssSubmittedOn)}`
                        : r.mandate?.formReceivedOn
                          ? `回収 ${formatDate(r.mandate.formReceivedOn)}`
                          : r.mandate?.formSentOn
                            ? `郵送 ${formatDate(r.mandate.formSentOn)}`
                            : "—"}
                    </TD>
                    <TD className="text-right">
                      <Link href={`/orders/${r.customer.id}`} className="text-xs text-primary hover:underline">
                        案件ページで記録 →
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 履歴 */}
      <Card>
        <CardHeader>
          <CardTitle>引き落としの履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <EmptyState title="まだありません" description="上の「NSS登録用の一覧を作る」から始めます。" />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>一覧</TH>
                  <TH>引き落とし日</TH>
                  <TH className="text-right">件数</TH>
                  <TH className="text-right">金額</TH>
                  <TH>結果</TH>
                  <TH>状態</TH>
                </TR>
              </THead>
              <TBody>
                {batches.map((b) => {
                  const total = b.items.reduce((s, i) => s + i.amount, 0);
                  const success = b.items.filter((i) => i.result === "success").length;
                  const ng = b.items.filter((i) => i.result === "failed").length;
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
                        {success + ng > 0 ? (
                          <span>
                            <span className="text-success">引き落とし済 {success}</span>
                            {ng > 0 && <span className="text-destructive"> / 不可 {ng}</span>}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD>
                        <BatchStatusBadge status={b.status} />
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

function order(stage: NssStage): number {
  return ["failed", "form_received", "not_started", "form_sent", "submitted", "active", "revoked"].indexOf(stage);
}
