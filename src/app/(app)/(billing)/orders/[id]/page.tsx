import {
  ArrowLeft,
  Building2,
  ExternalLink,
  FileSignature,
  Gift,
  Handshake,
  History,
  Landmark,
  Mail,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CredentialsPanel } from "@/components/orders/credentials-panel";
import {
  DealTypeBadge,
  FlowStepper,
  OwnerBadge,
  StageBadge,
  StepIcon,
} from "@/components/orders/order-ui";
import {
  ContractStatusBadge,
  InvoiceStatusBadge,
  MandateStatusBadge,
  SubscriptionStatusBadge,
} from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { getServiceRepository } from "@/lib/data";
import { hasLegacyBankInfo } from "@/lib/data/mandate";
import {
  agencyCommissionAmount,
  agencyRateLabel,
  commissionStatus,
} from "@/lib/domain/agency";
import { normalizeStoreCount } from "@/lib/domain/calculations";
import {
  AGENCY_DEAL_TYPES,
  agencyCommissionStatusLabels,
  agencyCommissionStatusTone,
  referralRewardStatusLabels,
} from "@/lib/domain/constants";
import {
  onboardingStageLabels,
  orderOwnerLabels,
  type ManualChecklistKey,
  type OrderStepItem,
  type OrderTrack,
} from "@/lib/domain/onboarding";
import { getEmailStatus } from "@/lib/email";
import { loadOrderBook, type OrderRow } from "@/lib/orders/load";
import { cn, formatDate, formatDateTime, formatJPY, maskAccount } from "@/lib/utils";
import {
  ClearBankInfoButton,
  CloseOrderButton,
  ConfirmOrderButton,
  ConfirmResultNotice,
  ManualCheck,
  NssStepButton,
  OrderNoteForm,
  SendInvoiceButton,
  type ConfirmPreview,
} from "./order-actions";

export const metadata = { title: "案件の詳細（受注管理）" };
export const dynamic = "force-dynamic";

/**
 * 案件ページ(顧客1件 = 案件1件)。申込・契約から運用開始までの手続きを1枚に並べ、
 * 「次にやること」とその操作ボタンを上に出す。
 */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = await getServiceRepository();
  const book = await loadOrderBook(repo);
  const row = book.rows.find((r) => r.customer.id === id);
  if (!row) notFound();

  const [commissions, org] = await Promise.all([
    repo.listAgencyCommissions({ customerId: id }),
    repo.getOrganization(),
  ]);
  const emailReady = getEmailStatus().mode === "send";
  const { customer, progress, application, mandate } = row;
  const contract = row.contracts.find((c) => c.id === progress.contractId) ?? null;
  const signedContract = row.contracts.find((c) => c.status === "signed") ?? null;
  const initialInvoice = progress.initialInvoiceId
    ? (row.invoices.find((i) => i.id === progress.initialInvoiceId) ?? null)
    : null;
  const subscription = row.subscriptions.find((s) => s.status === "active") ?? row.subscriptions[0] ?? null;
  const plan = subscription ? book.plans.find((p) => p.id === subscription.planId) : null;
  const termsPlan = signedContract?.terms.planId
    ? book.plans.find((p) => p.id === signedContract.terms.planId)
    : null;

  // 受注確定ダイアログの見込み(初回請求・毎月の請求・代理店報酬)
  let confirmPreview: ConfirmPreview | null = null;
  if (signedContract && !progress.billingStarted) {
    const terms = signedContract.terms;
    const initialFee = terms.initialFee ?? termsPlan?.initialFee ?? 0;
    const dealType = row.dealType;
    confirmPreview = {
      contractId: signedContract.id,
      contractNumber: signedContract.contractNumber,
      planName: terms.planName,
      storeCount: normalizeStoreCount(terms.storeCount),
      initialFee,
      monthlyFee: terms.monthlyFee ?? 0,
      taxRate: termsPlan?.taxRate ?? 0.1,
      referred: Boolean(customer.referredByCustomerId),
      agencyCommission:
        row.agency && dealType && initialFee > 0
          ? {
              agencyName: row.agency.name,
              label: `${AGENCY_DEAL_TYPES[dealType].label}・${agencyRateLabel(dealType)}`,
              amount: agencyCommissionAmount(initialFee, dealType),
            }
          : null,
      customerEmail: customer.email,
      emailReady,
      defaultStartDate: terms.startDate,
    };
  }

  const closed = progress.stage === "closed";
  const next = progress.next;

  return (
    <div className="space-y-5">
      <ConfirmResultNotice />
      <Link
        href="/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        受注管理へ
      </Link>

      {/* 見出し */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{customer.name}</h1>
            <StageBadge stage={progress.stage} />
            <span className="text-xs text-muted-foreground">このステージ {row.daysInStage}日目</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span className="tabular">{customer.code}</span>
            {(signedContract ?? contract) && (
              <span>・{(signedContract ?? contract)!.terms.planName || "プラン未設定"}</span>
            )}
            {progress.monthlyFee > 0 && <span>・月額 {formatJPY(progress.monthlyFee)}（税込）</span>}
            {row.agency && row.dealType && (
              <>
                <span>・{row.agency.name}</span>
                <DealTypeBadge dealType={row.dealType} withRate />
              </>
            )}
            {customer.referredByCustomerId && <Badge tone="info">ご紹介（特典対象）</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/customers/${customer.id}`} className={buttonClasses({ variant: "outline", size: "sm" })}>
            顧客詳細
          </Link>
          {contract && (
            <Link href={`/contracts/${contract.id}`} className={buttonClasses({ variant: "outline", size: "sm" })}>
              <FileSignature className="h-4 w-4" />
              契約書
            </Link>
          )}
          <CloseOrderButton customerId={customer.id} closed={closed} />
        </div>
      </div>

      <FlowStepper current={closed ? undefined : progress.stage} compact />

      {/* 次にやること */}
      {!closed && (
        <NextActionCard
          row={row}
          next={next}
          confirmPreview={confirmPreview}
          emailReady={emailReady}
          initialInvoiceId={initialInvoice?.id ?? null}
        />
      )}
      {closed && (
        <Card className="border-border bg-muted/40 p-4 text-sm">
          この案件は「{onboardingStageLabels.closed}」です。再開すると、実データからステージが自動で決め直されます。
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* チェックリスト(トラック) */}
        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <ProgressBar
              value={progress.doneCount}
              max={progress.totalCount}
              tone={progress.stage === "operating" ? "success" : "primary"}
              label="導入までの進み具合"
              valueLabel={`${progress.doneCount} / ${progress.totalCount}`}
            />
          </Card>
          {progress.tracks.map((track) => (
            <TrackCard
              key={track.key}
              track={track}
              row={row}
              emailReady={emailReady}
              initialInvoiceId={initialInvoice?.id ?? null}
              confirmPreview={confirmPreview}
            />
          ))}
        </div>

        {/* サイド: お申込み内容・契約・請求・代理店/紹介・メモ・履歴 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>お申込み内容</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <Info icon={<Building2 className="h-4 w-4" />} value={customer.name} />
              <Info
                icon={<User className="h-4 w-4" />}
                value={
                  application
                    ? [application.representativeTitle, application.representativeName].filter(Boolean).join(" ") +
                      (application.contactName ? `（担当: ${application.contactName}）` : "")
                    : customer.contactName || "—"
                }
              />
              <Info icon={<Phone className="h-4 w-4" />} value={customer.phone || "—"} />
              <Info icon={<Mail className="h-4 w-4" />} value={customer.email || "—"} />
              <Info icon={<MapPin className="h-4 w-4" />} value={customer.address || "—"} />
              {application ? (
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(application.submittedAt)} に「{application.linkName}」から受付 ・{" "}
                  <Link href={`/applications/${application.id}`} className="text-primary hover:underline">
                    申込の詳細
                  </Link>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">申込URLを使わずに登録された顧客です。</p>
              )}
            </CardContent>
          </Card>

          {application && <CredentialsPanel applicationId={application.id} application={application} />}

          <Card>
            <CardHeader>
              <CardTitle>契約・請求</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="契約書">
                {contract ? (
                  <span className="flex items-center gap-2">
                    <Link href={`/contracts/${contract.id}`} className="tabular text-primary hover:underline">
                      {contract.contractNumber}
                    </Link>
                    <ContractStatusBadge status={contract.status} />
                  </span>
                ) : (
                  "—"
                )}
              </Row>
              {signedContract && (
                <Row label="締結">
                  {formatDateTime(signedContract.signedAt)}（{signedContract.signerName || "—"}）
                </Row>
              )}
              <Row label="初回請求">
                {initialInvoice ? (
                  <span className="flex items-center gap-2">
                    <Link href={`/invoices/${initialInvoice.id}`} className="tabular text-primary hover:underline">
                      {formatJPY(initialInvoice.total)}
                    </Link>
                    <InvoiceStatusBadge status={initialInvoice.status} />
                  </span>
                ) : (
                  "—"
                )}
              </Row>
              <Row label="毎月の請求">
                {subscription && plan ? (
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="flex items-center gap-2">
                      {plan.name}・{normalizeStoreCount(subscription.storeCount)}店舗
                      <SubscriptionStatusBadge status={subscription.status} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      次回 {formatDate(subscription.nextBillingDate)}
                    </span>
                  </span>
                ) : (
                  "受注確定で作成"
                )}
              </Row>
              <Row label="口座振替（NSS）">
                {mandate ? (
                  <span className="flex flex-col items-end gap-0.5">
                    <MandateStatusBadge status={mandate.status} />
                    {mandate.debitStartMonth && (
                      <span className="text-xs text-muted-foreground">
                        {mandate.debitStartMonth.replace("-", "年")}月分から引き落とし
                      </span>
                    )}
                  </span>
                ) : progress.needsMandate ? (
                  "未着手"
                ) : (
                  "対象外"
                )}
              </Row>
              {progress.outstanding > 0 && (
                <Row label="未収金">
                  <span className="tabular font-medium text-warning">{formatJPY(progress.outstanding)}</span>
                </Row>
              )}
              {mandate && hasLegacyBankInfo(mandate) && (
                <div className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
                  旧運用で保存した口座情報が残っています（{mandate.bankName} {maskAccount(mandate.accountNumber)}）。
                  口座情報は NSS で管理しているため、消去をおすすめします。
                  <div className="mt-1 text-right">
                    <ClearBankInfoButton customerId={customer.id} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {(row.agency || row.referral) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {row.agency ? <Handshake className="h-4 w-4 text-primary" /> : <Gift className="h-4 w-4 text-primary" />}
                  {row.agency ? "代理店" : "紹介"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                {row.agency && row.dealType && (
                  <>
                    <Row label="代理店">
                      <Link href={`/agencies/${row.agency.id}`} className="text-primary hover:underline">
                        {row.agency.name}
                      </Link>
                    </Row>
                    <Row label="営業担当">{row.agencyMember?.name ?? "—"}</Row>
                    <Row label="区分">
                      <DealTypeBadge dealType={row.dealType} withRate />
                    </Row>
                    <p className="text-xs text-muted-foreground">{AGENCY_DEAL_TYPES[row.dealType].scope}</p>
                    {commissions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        報酬は受注確定のときに計上されます（初期費用の入金後に支払対象）。
                      </p>
                    ) : (
                      commissions.map((c) => {
                        const status = commissionStatus(
                          c,
                          row.invoices.find((i) => i.id === c.invoiceId) ?? null,
                        );
                        return (
                          <Row key={c.id} label="報酬">
                            <span className="flex items-center gap-2">
                              <span className="tabular font-medium">{formatJPY(c.amount)}</span>
                              <Badge tone={agencyCommissionStatusTone[status]}>
                                {agencyCommissionStatusLabels[status]}
                              </Badge>
                            </span>
                          </Row>
                        );
                      })
                    )}
                  </>
                )}
                {row.referral && !row.referral.agencyId && (
                  <>
                    <Row label="紹介者">{row.referral.referrerName || "—"}</Row>
                    <Row label="紹介者へのお支払い">
                      {row.referral.rewardAmount > 0
                        ? `${formatJPY(row.referral.rewardAmount)}（${referralRewardStatusLabels[row.referral.rewardStatus]}）`
                        : "受注確定で確定"}
                    </Row>
                    <Link href="/referrals" className="text-xs text-primary hover:underline">
                      紹介・問い合わせを開く
                    </Link>
                  </>
                )}
                {row.referral?.agencyId && (
                  <p className="text-xs text-muted-foreground">
                    代理店URLの「まずは相談したい」から届いた問い合わせが元の案件です。
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>メモ・フォロー期日</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderNoteForm
                customerId={customer.id}
                dueDate={row.card.dueDate}
                nextAction={row.card.nextAction}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                ステージの履歴
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {[...row.card.history].reverse().map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <StageBadge stage={h.stage} />
                    <span>{formatDateTime(h.at)}</span>
                    <span>・{h.by}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <p className="px-1 text-[11px] text-muted-foreground">発行元: {org.name}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 次にやること */

function NextActionCard({
  row,
  next,
  confirmPreview,
  emailReady,
  initialInvoiceId,
}: {
  row: OrderRow;
  next: OrderStepItem | null;
  confirmPreview: ConfirmPreview | null;
  emailReady: boolean;
  initialInvoiceId: string | null;
}) {
  if (!next) {
    return (
      <Card className="border-success/40 bg-success/5 p-4">
        <div className="text-sm font-semibold text-success">導入準備はすべて完了しています</div>
        <p className="mt-1 text-sm text-muted-foreground">
          毎月の請求書は自動で作られます。引き落としは「NSS引き落とし」で毎月登録・結果反映します。
        </p>
      </Card>
    );
  }
  return (
    <Card className={cn("p-4", next.waiting ? "border-info/40 bg-info/5" : "border-primary/40 bg-primary/5")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            {next.waiting ? "いまは待ち" : "次にやること"}
            <OwnerBadge
              owner={next.owner}
              label={next.owner === "agency" && row.agency ? `代理店（${row.agency.name}）` : orderOwnerLabels[next.owner]}
            />
          </div>
          <div className={cn("mt-1 text-base font-bold", next.late && "text-destructive")}>{next.label}</div>
          {next.hint && <p className="mt-0.5 text-sm text-muted-foreground">{next.hint}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ItemAction
            item={next}
            row={row}
            emailReady={emailReady}
            initialInvoiceId={initialInvoiceId}
            confirmPreview={confirmPreview}
            primary
          />
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- トラック */

function TrackCard({
  track,
  row,
  emailReady,
  initialInvoiceId,
  confirmPreview,
}: {
  track: OrderTrack;
  row: OrderRow;
  emailReady: boolean;
  initialInvoiceId: string | null;
  confirmPreview: ConfirmPreview | null;
}) {
  const required = track.items.filter((i) => !i.skipped && !i.optional);
  const doneCount = required.filter((i) => i.done).length;
  const allSkipped = track.items.every((i) => i.skipped);
  const icon =
    track.key === "nss" ? (
      <Landmark className="h-4 w-4 text-primary" />
    ) : track.key === "apply" ? (
      <FileSignature className="h-4 w-4 text-primary" />
    ) : null;
  return (
    <Card className={cn(allSkipped && "opacity-60")}>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2">
          {icon}
          {track.label}
        </CardTitle>
        <span className="tabular text-xs text-muted-foreground">
          {allSkipped ? "対象外" : `${doneCount}/${required.length}`}
        </span>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {track.items.map((item) => (
            <li key={item.key} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5">
                  <StepIcon item={item} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "text-sm",
                        item.done && "text-muted-foreground",
                        item.skipped && "text-muted-foreground line-through",
                        item.late && !item.done && "font-medium text-destructive",
                      )}
                    >
                      {item.label}
                    </span>
                    {!item.skipped && (
                      <OwnerBadge
                        owner={item.owner}
                        label={
                          item.owner === "agency" && row.agency
                            ? `代理店（${row.agency.name}）`
                            : undefined
                        }
                      />
                    )}
                    {item.optional && <Badge tone="neutral">参考</Badge>}
                  </div>
                  {(item.done || item.doneAt) && !item.skipped && (
                    <div className="text-xs text-muted-foreground">
                      {item.doneAt ? formatDate(item.doneAt) : ""}
                      {item.doneBy ? `・${item.doneBy}` : ""}
                    </div>
                  )}
                  {item.hint && !item.done && (
                    <div className={cn("text-xs text-muted-foreground", item.late && "text-destructive")}>
                      {item.blocked ? "前の手続きが終わると着手できます。" : item.hint}
                    </div>
                  )}
                </div>
              </div>
              {!item.skipped && !item.blocked && (
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                  <ItemAction
                    item={item}
                    row={row}
                    emailReady={emailReady}
                    initialInvoiceId={initialInvoiceId}
                    confirmPreview={confirmPreview}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

const MANUAL_KEYS: ManualChecklistKey[] = [
  "review_checked",
  "initial_invoice_sent",
  "setup_info",
  "setup_done",
  "setup_delivered",
];

/** 項目ごとの操作ボタン */
function ItemAction({
  item,
  row,
  emailReady,
  initialInvoiceId,
  confirmPreview,
  primary,
}: {
  item: OrderStepItem;
  row: OrderRow;
  emailReady: boolean;
  initialInvoiceId: string | null;
  confirmPreview: ConfirmPreview | null;
  primary?: boolean;
}) {
  const customerId = row.customer.id;
  const contract = row.contracts.find((c) => c.id === row.progress.contractId) ?? null;
  const mandate = row.mandate;

  switch (item.key) {
    case "contract_signed":
      if (item.done) return null;
      if (!contract || contract.status === "canceled" || contract.status === "declined") {
        return (
          <Link
            href={`/contracts/new?customer=${customerId}`}
            className={buttonClasses({ size: "sm", variant: primary ? "primary" : "outline" })}
          >
            契約書を作成
          </Link>
        );
      }
      return (
        <Link
          href={`/contracts/${contract.id}`}
          className={buttonClasses({ size: "sm", variant: primary ? "primary" : "outline" })}
        >
          {contract.status === "draft" ? "契約書を送付" : "契約書を開く（リマインド・再送）"}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      );
    case "order_confirmed":
      if (item.done || !confirmPreview) return null;
      return <ConfirmOrderButton preview={confirmPreview} />;
    case "initial_invoice_sent":
      return (
        <>
          {initialInvoiceId && (
            <Link
              href={`/invoices/${initialInvoiceId}`}
              className={buttonClasses({ size: "sm", variant: "ghost" })}
            >
              請求書
            </Link>
          )}
          {!item.done && initialInvoiceId && (
            <SendInvoiceButton customerId={customerId} invoiceId={initialInvoiceId} emailReady={emailReady} />
          )}
          {/* 実データから完了と判定した項目(入金済みなど)は手で取り消せない */}
          {item.mode === "manual" && (
            <ManualCheck customerId={customerId} itemKey="initial_invoice_sent" done={item.done} />
          )}
        </>
      );
    case "initial_paid":
      if (item.done) return null;
      return (
        <>
          {initialInvoiceId && (
            <Link
              href={`/invoices/${initialInvoiceId}`}
              className={buttonClasses({ size: "sm", variant: "ghost" })}
            >
              請求書
            </Link>
          )}
          <Link href="/payments" className={buttonClasses({ size: "sm", variant: primary ? "primary" : "outline" })}>
            入金確認へ
          </Link>
        </>
      );
    case "nss_form_sent":
      return item.done ? null : (
        <NssStepButton customerId={customerId} step="form_sent" label="郵送した" variant={primary ? "primary" : "outline"} />
      );
    case "nss_form_received":
      return item.done ? null : (
        <NssStepButton customerId={customerId} step="form_received" label="回収した" variant={primary ? "primary" : "outline"} />
      );
    case "nss_submitted":
      return item.done && mandate?.status !== "failed" ? null : (
        <NssStepButton
          customerId={customerId}
          step="submitted"
          label={mandate?.status === "failed" ? "再提出した" : "NSSへ登録した"}
          variant={primary ? "primary" : "outline"}
        />
      );
    case "nss_active":
      if (item.done) {
        return <NssStepButton customerId={customerId} step="revoked" label="停止・解約" variant="ghost" />;
      }
      return (
        <>
          <NssStepButton customerId={customerId} step="rejected" label="不備あり" variant="ghost" />
          <NssStepButton
            customerId={customerId}
            step="registered"
            label="登録完了（振替開始月を記録）"
            variant={primary ? "primary" : "outline"}
          />
        </>
      );
    case "nss_first_debit":
      return item.done ? null : (
        <Link href="/direct-debit" className={buttonClasses({ size: "sm", variant: "ghost" })}>
          NSS引き落としへ
        </Link>
      );
    default:
      if ((MANUAL_KEYS as string[]).includes(item.key) && item.mode === "manual") {
        return <ManualCheck customerId={customerId} itemKey={item.key as ManualChecklistKey} done={item.done} />;
      }
      return null;
  }
}

function Info({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}
