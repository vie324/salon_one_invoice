import { ArrowRight, Gift, Hourglass, ListChecks, Search } from "lucide-react";
import Link from "next/link";
import { IssueLinkDialog } from "@/components/orders/issue-link-dialog";
import { DealTypeBadge, FlowStepper, OwnerBadge, StageBadge } from "@/components/orders/order-ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ProgressBar } from "@/components/ui/progress";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import {
  ONBOARDING_STAGES,
  ORDER_TASK_GROUPS,
  onboardingStageLabels,
  orderOwnerLabels,
  taskGroupFor,
  type OrderStepItem,
} from "@/lib/domain/onboarding";
import { contactDue, isOpenReferral } from "@/lib/domain/referral";
import type { Application, OnboardingStage } from "@/lib/domain/types";
import { loadOrderBook, sortOrderRows, type OrderRow } from "@/lib/orders/load";
import { cn, formatJPY } from "@/lib/utils";

export const metadata = { title: "受注管理" };

// 実データから進み具合を判定するため、常にサーバーで描画する
export const dynamic = "force-dynamic";

const FILTERS: (OnboardingStage | "all")[] = ["all", ...ONBOARDING_STAGES];

/**
 * 受注管理 — 申込・契約から運用開始までを1か所で管理する。
 *
 *   ① 申込・契約(お客様) → ② 受注確認(請求管理者) → ③ 導入準備 → ④ 運用中
 *
 * 「誰が・次に何をするか」を案件をまたいで並べ(対応待ち)、抜け漏れを防ぐ。
 * ステージとチェックの多くは実データから自動で決まるので、カードを動かす操作は無い。
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const stageFilter = (FILTERS as string[]).includes(sp.stage ?? "")
    ? (sp.stage as OnboardingStage | "all")
    : "all";
  const q = (sp.q ?? "").trim().toLowerCase();

  const repo = await getServiceRepository();
  const [book, referrals, org] = await Promise.all([
    loadOrderBook(repo),
    repo.listReferrals(),
    repo.getOrganization(),
  ]);
  const rows = sortOrderRows(book.rows);

  const counts: Partial<Record<OnboardingStage, number>> = {};
  for (const r of rows) counts[r.progress.stage] = (counts[r.progress.stage] ?? 0) + 1;

  // 対応待ち: 案件をまたいで「やること」ごとにまとめる(1案件1行)
  const groups = ORDER_TASK_GROUPS.map((g) => {
    const entries: { row: OrderRow; item: OrderStepItem }[] = [];
    for (const row of rows) {
      if (row.progress.stage === "closed") continue;
      const item = row.progress.open.find((i) => taskGroupFor(i) === g.key);
      if (item) entries.push({ row, item });
    }
    return { ...g, entries };
  });
  const actionGroups = groups.filter((g) => !g.waiting && g.entries.length > 0);
  const waitingGroups = groups.filter((g) => g.waiting && g.entries.length > 0);
  const pendingApps = book.pendingApplications;
  const actionCount =
    pendingApps.length + actionGroups.reduce((s, g) => s + g.entries.length, 0);

  const openLeads = referrals.filter((r) => isOpenReferral(r));
  const overdueLeads = openLeads.filter((r) => contactDue(r).overdue).length;

  const filtered = rows.filter((r) => {
    if (stageFilter !== "all" && r.progress.stage !== stageFilter) return false;
    if (stageFilter === "all" && r.progress.stage === "closed") return false;
    if (!q) return true;
    return (
      r.customer.name.toLowerCase().includes(q) ||
      r.customer.code.toLowerCase().includes(q) ||
      (r.agency?.name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <PageHeader
        className="mb-0 sm:mb-0"
        title="受注管理"
        description="申込・契約から運用開始までを1か所で管理します。ステージとチェックは契約・請求・入金・NSS の実データから自動で進みます。「対応待ち」を上から片づければ抜け漏れはありません。"
        actions={
          <>
            <Link
              href="/applications"
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-input bg-card px-4 text-sm font-medium hover:bg-muted md:h-10"
            >
              発行済みのURL
            </Link>
            <IssueLinkDialog
              plans={book.plans}
              agencies={book.agencies}
              members={book.agencyMembers}
              orgName={org.name}
            />
          </>
        }
      />

      <FlowStepper counts={counts} hrefFor={(stage) => `/orders?stage=${stage}`} />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* こちらの番 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              対応待ち（こちらの番）
              <span className="tabular text-sm font-normal text-muted-foreground">
                {actionCount}件
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingApps.length > 0 && <PendingApplications applications={pendingApps} />}
            {actionGroups.length === 0 ? (
              pendingApps.length === 0 && (
                <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  いま対応が必要な案件はありません。
                </p>
              )
            ) : (
              actionGroups.map((g) => (
                <div key={g.key} className="rounded-md border border-border">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
                    <span className="text-sm font-semibold">{g.label}</span>
                    <OwnerBadge owner={g.owner} />
                    <span className="tabular text-xs text-muted-foreground">{g.entries.length}件</span>
                    <span className="hidden text-xs text-muted-foreground md:inline">— {g.description}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {g.entries.map(({ row, item }) => (
                      <TaskRow key={row.customer.id} row={row} item={item} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          {/* お客様・NSS 待ち */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Hourglass className="h-4 w-4 text-info" />
                お客様・NSS 待ち
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {waitingGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">待ちの案件はありません。</p>
              ) : (
                waitingGroups.map((g) => (
                  <div key={g.key}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {g.label}
                      <span className="tabular text-xs text-muted-foreground">{g.entries.length}件</span>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {g.entries.map(({ row, item }) => (
                        <li key={row.customer.id} className="flex items-center justify-between gap-2 text-sm">
                          <Link
                            href={`/orders/${row.customer.id}`}
                            className={cn(
                              "min-w-0 truncate text-primary hover:underline",
                              item.late && "font-semibold text-destructive",
                            )}
                          >
                            {row.customer.name}
                          </Link>
                          <span
                            className={cn(
                              "shrink-0 text-xs text-muted-foreground",
                              item.late && "text-destructive",
                            )}
                          >
                            {item.late ? "要確認" : `${row.daysInStage}日`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* 紹介・問い合わせ(申込前の見込み) */}
          <Card>
            <CardContent className="pt-4 sm:pt-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Gift className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-semibold">紹介・問い合わせ（申込の前）</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    連絡待ち {openLeads.length}件
                    {overdueLeads > 0 && (
                      <span className="font-semibold text-destructive">（希望日超過 {overdueLeads}件）</span>
                    )}
                    。連絡したら、その画面から申込・契約URLを発行して送ります。
                  </p>
                  <Link
                    href="/referrals"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    紹介・問い合わせを開く <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 案件一覧 */}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>案件一覧</CardTitle>
            <form className="relative" action="/orders">
              {stageFilter !== "all" && <input type="hidden" name="stage" value={stageFilter} />}
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="お客様名・コード・代理店で検索"
                className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-base md:w-64 md:text-sm"
              />
            </form>
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="ステージで絞り込み">
            {FILTERS.map((f) => {
              const count =
                f === "all"
                  ? rows.filter((r) => r.progress.stage !== "closed").length
                  : (counts[f] ?? 0);
              return (
                <Link
                  key={f}
                  href={f === "all" ? "/orders" : `/orders?stage=${f}`}
                  role="tab"
                  aria-selected={stageFilter === f}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium",
                    stageFilter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {f === "all" ? "進行中すべて" : onboardingStageLabels[f]}
                  <span className="tabular opacity-80">{count}</span>
                </Link>
              );
            })}
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              title="該当する案件はありません"
              description="申込・契約URLを発行してお客様にお渡しすると、申込と同時に案件がここに並びます。"
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>お客様</TH>
                  <TH>ステージ</TH>
                  <TH>進み具合</TH>
                  <TH>次にやること</TH>
                  <TH className="text-right">経過</TH>
                  <TH className="text-right">月額(税込)</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((row) => {
                  const next = row.progress.next;
                  return (
                    <TR key={row.customer.id}>
                      <TD primary>
                        <Link
                          href={`/orders/${row.customer.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {row.customer.name}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="tabular">{row.customer.code}</span>
                          {row.agency && row.dealType && (
                            <>
                              <span>・{row.agency.name}</span>
                              <DealTypeBadge dealType={row.dealType} />
                            </>
                          )}
                          {row.customer.referredByCustomerId && <Badge tone="info">紹介</Badge>}
                        </div>
                      </TD>
                      <TD>
                        <StageBadge stage={row.progress.stage} />
                      </TD>
                      <TD className="min-w-[8rem]">
                        <ProgressBar
                          value={row.progress.doneCount}
                          max={row.progress.totalCount}
                          tone={row.progress.stage === "operating" ? "success" : "primary"}
                          valueLabel={`${row.progress.doneCount}/${row.progress.totalCount}`}
                          ariaLabel="進み具合"
                        />
                      </TD>
                      <TD>
                        {next ? (
                          <div className="flex flex-col gap-0.5">
                            <span className={cn("text-sm", next.late && "font-medium text-destructive")}>
                              {next.waiting ? "待ち: " : ""}
                              {next.label}
                            </span>
                            <span>
                              <OwnerBadge owner={next.owner} label={ownerLabel(row, next)} />
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {row.progress.stage === "operating" ? "導入完了" : "—"}
                          </span>
                        )}
                      </TD>
                      <TD className="tabular text-right text-xs text-muted-foreground">
                        {row.daysInStage}日
                      </TD>
                      <TD className="tabular text-right">
                        {row.progress.monthlyFee > 0 ? formatJPY(row.progress.monthlyFee) : "—"}
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

/** 担当の表示(代理店が担当する項目は代理店名にする) */
function ownerLabel(row: OrderRow, item: OrderStepItem): string {
  if (item.owner === "agency" && row.agency) return `代理店（${row.agency.name}）`;
  return orderOwnerLabels[item.owner];
}

/** 「申込のみ」URLから届いた申込(顧客登録 → 契約書の送付が必要) */
function PendingApplications({ applications }: { applications: Application[] }) {
  const now = Date.now();
  return (
    <div className="rounded-md border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="text-sm font-semibold">届いた申込の確認（顧客登録がまだ）</span>
        <OwnerBadge owner="billing" />
        <span className="tabular text-xs text-muted-foreground">{applications.length}件</span>
        <span className="hidden text-xs text-muted-foreground md:inline">
          — 内容を確認して「顧客として登録」し、契約書を作成・送付します（すぐ請求するなら「顧客登録して請求書を作成」）
        </span>
      </div>
      <ul className="divide-y divide-border">
        {applications.map((a) => {
          const days = Math.max(0, Math.floor((now - new Date(a.submittedAt).getTime()) / 86_400_000));
          return (
            <li key={a.id}>
              <Link
                href={`/applications/${a.id}`}
                className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.companyName}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {a.representativeName} 様 ・「{a.linkName || "申込URL"}」から受付 — 料金が決まったら契約書を送ります
                  </div>
                </div>
                <span className="tabular shrink-0 text-xs text-muted-foreground">{days}日</span>
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TaskRow({ row, item }: { row: OrderRow; item: OrderStepItem }) {
  return (
    <li>
      <Link
        href={`/orders/${row.customer.id}`}
        className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-sm font-medium", item.late && "text-destructive")}>
              {row.customer.name}
            </span>
            {item.late && <Badge tone="danger">遅れ</Badge>}
            {item.owner === "agency" && row.agency && (
              <OwnerBadge owner="agency" label={`代理店: ${row.agency.name}`} />
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {item.label}
            {item.hint ? ` — ${item.hint}` : ""}
          </div>
        </div>
        <span className="tabular shrink-0 text-xs text-muted-foreground">{row.daysInStage}日</span>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
