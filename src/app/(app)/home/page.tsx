import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  MessageSquare,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { CompletionBanner } from "@/components/notifications/completion-banner";
import {
  DevIssueCategoryBadge,
  DevIssuePriorityBadge,
  DevIssueStatusBadge,
} from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar, SegmentedBar } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { Repository } from "@/lib/data/repository";
import { canAccessBilling, canAccessDev, isEngineer, isProductAdmin } from "@/lib/domain/constants";
import {
  isOpenIssue,
  issueUrgency,
  pendingApprovers,
  sortByUrgency,
  STALE_DAYS,
  type DevIssueUrgency,
} from "@/lib/domain/dev-issues";
import type { DashboardMetrics, DevIssue, UserProfile } from "@/lib/domain/types";
import { currentMonth, formatDate, formatJPY, formatMonthKey, formatPercent } from "@/lib/utils";

export const metadata = { title: "進捗ホーム" };

// 集計はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

/**
 * 進捗ホーム — アプリを開いて最初に出る画面。
 *
 * 「売上はどこまで来ているか」「開発はどこで止まっているか」を、
 * スマホ1画面ぶんのスクロールで掴めるようにまとめる。
 * 詳細は各セクションのリンクから既存の画面(ダッシュボード / 開発進捗)へ送る。
 *
 * 表示するセクションは役割で決まる。請求権限が無いアカウントに
 * 売上データを読ませないよう、取得自体を権限で分岐している。
 */
export default async function HomePage() {
  const [user, repo] = await Promise.all([requireUser(), getServiceRepository()]);
  const showBilling = canAccessBilling(user.roles);
  const showDev = canAccessDev(user.roles);
  const month = currentMonth();

  const [billing, dev] = await Promise.all([
    showBilling ? loadBilling(repo, month) : Promise.resolve(null),
    showDev ? loadDev(repo, user, month) : Promise.resolve(null),
  ]);

  const todos = [...(billing?.todos ?? []), ...(dev?.todos ?? [])].sort(
    (a, b) => TODO_WEIGHT[a.tone] - TODO_WEIGHT[b.tone],
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* エラー対応完了などのお知らせ(未読があるあいだトップに表示) */}
      <CompletionBanner />

      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          こんにちは、{user.name.replace(/（.*/, "")} さん
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
          {formatDate(new Date())} 時点の
          {showBilling && showDev ? "売上と開発" : showBilling ? "売上" : "開発"}の進捗です。
        </p>
      </div>

      {/* いま急ぐこと — 売上・開発を混ぜて1枚にまとめる */}
      <TodoCard todos={todos} />

      {billing && <BillingSection metrics={billing.metrics} month={month} />}
      {dev && <DevSection dev={dev} month={month} />}
    </div>
  );
}

/* ---------------------------------------------------------------- 要対応 */

type TodoTone = "danger" | "warning" | "info";

interface TodoItem {
  href: string;
  icon: React.ElementType;
  label: string;
  /** 件数(0 の項目は表示しない) */
  count: number;
  /** 金額や内訳などの補足 */
  detail?: string;
  tone: TodoTone;
}

/** 赤(止まっている) → 黄(急ぐ) → 青(手番が来ている) の順に並べる */
const TODO_WEIGHT: Record<TodoTone, number> = { danger: 0, warning: 1, info: 2 };

const todoToneClass: Record<TodoTone, string> = {
  danger: "bg-destructive/12 text-destructive",
  warning: "bg-warning/15 text-[hsl(38_92%_32%)] dark:text-warning",
  info: "bg-info/12 text-info",
};

function TodoCard({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) {
    return (
      <Card className="flex items-center gap-3 p-4 sm:p-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/12 text-success">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">いま急ぎの対応はありません</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            期限超過・未消込・急ぎの開発依頼はすべて片づいています。
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          いま急ぐこと
          <span className="tabular text-sm font-normal text-muted-foreground">
            {todos.length}件
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <ul className="-mx-1 divide-y divide-border">
          {todos.map((todo) => {
            const Icon = todo.icon;
            return (
              <li key={todo.href + todo.label}>
                <Link
                  href={todo.href}
                  className="flex min-h-11 items-center gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-muted active:bg-muted"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${todoToneClass[todo.tone]}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{todo.label}</span>
                    {todo.detail && (
                      <span className="tabular block truncate text-xs text-muted-foreground">
                        {todo.detail}
                      </span>
                    )}
                  </span>
                  <span className="tabular shrink-0 text-sm font-bold">{todo.count}件</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- 売上 */

async function loadBilling(repo: Repository, month: string) {
  const [metrics, invoices, bankTxns] = await Promise.all([
    repo.getDashboardMetrics(month),
    repo.listInvoices(),
    repo.listBankTransactions(),
  ]);

  const drafts = invoices.filter((i) => i.status === "draft").length;
  const unmatched = bankTxns.filter((t) => !t.matchedInvoiceId).length;

  const todos: TodoItem[] = [];
  if (metrics.overdueCount > 0) {
    todos.push({
      href: "/invoices?status=overdue",
      icon: AlertTriangle,
      label: "期限超過の請求",
      detail: `未収 ${formatJPY(metrics.overdueAmount)}`,
      count: metrics.overdueCount,
      tone: "danger",
    });
  }
  if (unmatched > 0) {
    todos.push({
      href: "/payments",
      icon: Wallet,
      label: "未消込の入金明細",
      detail: "銀行明細と請求書の突き合わせ",
      count: unmatched,
      tone: "warning",
    });
  }
  if (drafts > 0) {
    todos.push({
      href: "/invoices?status=draft",
      icon: FileText,
      label: "下書きのままの請求書",
      detail: "送付するとお客様に届きます",
      count: drafts,
      tone: "info",
    });
  }

  return { metrics, todos };
}

function BillingSection({ metrics, month }: { metrics: DashboardMetrics; month: string }) {
  const collectRate = metrics.monthInvoiced > 0 ? metrics.monthCollected / metrics.monthInvoiced : 0;
  const monthLabel = formatMonthKey(month, { short: true });

  return (
    <section className="space-y-3 sm:space-y-4">
      <SectionHeading
        icon={TrendingUp}
        title="売上の進捗"
        href="/dashboard"
        linkLabel="ダッシュボード"
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label={`${monthLabel}の請求`}
          value={formatJPY(metrics.monthInvoiced)}
          delta={metrics.invoicedMoM}
          sub="前月比"
        />
        <StatCard
          label={`${monthLabel}の入金`}
          value={formatJPY(metrics.monthCollected)}
          sub={`回収率 ${formatPercent(collectRate, 0)}`}
          accent="success"
        />
        <StatCard
          label="未収金"
          value={formatJPY(metrics.outstanding)}
          sub={
            metrics.overdueCount > 0 ? `期限超過 ${metrics.overdueCount}件` : "期限超過なし"
          }
          accent={metrics.overdueCount > 0 ? "danger" : "warning"}
        />
        <StatCard
          label="MRR(月次経常収益)"
          value={formatJPY(metrics.mrr)}
          sub={`稼働 ${metrics.activeCustomers}社`}
          icon={<Users className="h-4 w-4" />}
        />
      </div>

      <Card className="p-4 sm:p-5">
        <ProgressBar
          label={`${monthLabel}の回収`}
          valueLabel={`${formatJPY(metrics.monthCollected)} / ${formatJPY(metrics.monthInvoiced)}`}
          value={metrics.monthCollected}
          max={metrics.monthInvoiced}
          tone="success"
          ariaLabel={`${monthLabel}の回収率`}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {metrics.awaitingCount > 0
            ? `入金待ち ${metrics.awaitingCount}件 / ${formatJPY(metrics.awaitingAmount)}(引き落とし予定を含む)`
            : "入金待ちの請求はありません。"}
        </p>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>売上の推移（直近6ヶ月）</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueChart data={metrics.monthlyTrend} />
        </CardContent>
      </Card>
    </section>
  );
}

/* ---------------------------------------------------------------- 開発 */

async function loadDev(repo: Repository, user: CurrentUser, month: string) {
  const issues = await repo.listDevIssues();

  // 承認者(管理者)の判定に使う。読み取りに失敗しても進捗は表示する。
  let profiles: UserProfile[] = [];
  try {
    profiles = await repo.listUserProfiles();
  } catch {
    profiles = [];
  }

  const urgencyOf = new Map(issues.map((i) => [i.id, issueUrgency(i, profiles)] as const));
  const urgencyFor = (issue: DevIssue): DevIssueUrgency =>
    urgencyOf.get(issue.id) ?? issueUrgency(issue, profiles);
  const open = issues.filter(isOpenIssue);

  const byStatus = {
    open: open.filter((i) => i.status === "open").length,
    in_progress: open.filter((i) => i.status === "in_progress").length,
    hearing: open.filter((i) => i.status === "hearing").length,
  };
  const doneThisMonth = issues.filter(
    (i) => i.status === "done" && (i.completedDate ?? "").startsWith(month),
  ).length;
  const createdThisMonth = issues.filter((i) => i.createdAt.startsWith(month)).length;
  const stale = open.filter((i) => urgencyFor(i).days >= STALE_DAYS).length;
  const urgent = sortByUrgency(open.filter((i) => urgencyFor(i).urgent));

  const todos: TodoItem[] = [];
  if (urgent.length > 0) {
    todos.push({
      href: "/dev",
      icon: ClipboardList,
      label: "急ぎの開発依頼",
      detail:
        stale > 0
          ? `うち${STALE_DAYS}日以上の滞留 ${stale}件`
          : "不具合・高優先・ヒアリング返信の放置",
      count: urgent.length,
      tone: "danger",
    });
  }
  // 依頼者本人 — 追加ヒアリングに答える番
  const myHearing = open.filter(
    (i) => i.requesterId === user.id && urgencyFor(i).hearingAwaitingReply,
  ).length;
  if (myHearing > 0) {
    todos.push({
      href: "/dev?status=hearing",
      icon: MessageSquare,
      label: "あなたへの追加ヒアリング",
      detail: "返信するとエンジニアへ通知されます",
      count: myHearing,
      tone: "warning",
    });
  }
  // エンジニア — 返信が届いていて止まっているもの
  if (isEngineer(user.roles)) {
    const answered = open.filter((i) => urgencyFor(i).hearingAnswered).length;
    if (answered > 0) {
      todos.push({
        href: "/dev?status=hearing",
        icon: MessageSquare,
        label: "ヒアリングに返信が届いています",
        detail: "依頼者を待たせています",
        count: answered,
        tone: "warning",
      });
    }
  }
  // 承認者(管理者) — 自分の承諾待ち
  if (isProductAdmin(user.roles)) {
    const waiting = open.filter((i) =>
      pendingApprovers(i, profiles).some((p) => p.id === user.id),
    ).length;
    if (waiting > 0) {
      todos.push({
        href: "/dev",
        icon: UserCheck,
        label: "あなたの承諾待ちの要望",
        detail: "承諾が揃うと実行になります",
        count: waiting,
        tone: "info",
      });
    }
  }

  return {
    openCount: open.length,
    byStatus,
    doneThisMonth,
    createdThisMonth,
    stale,
    urgent: urgent.slice(0, 3).map((issue) => ({ issue, urgency: urgencyFor(issue) })),
    urgentCount: urgent.length,
    todos,
  };
}

function DevSection({
  dev,
  month: monthKey,
}: {
  dev: Awaited<ReturnType<typeof loadDev>>;
  month: string;
}) {
  const monthLabel = formatMonthKey(monthKey, { short: true });

  return (
    <section className="space-y-3 sm:space-y-4">
      <SectionHeading
        icon={ClipboardList}
        title="開発の進捗"
        href="/dev"
        linkLabel="開発進捗をすべて見る"
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="未完了の依頼"
          value={`${dev.openCount}件`}
          sub={dev.urgentCount > 0 ? `急ぎ ${dev.urgentCount}件` : "急ぎはありません"}
          accent={dev.urgentCount > 0 ? "danger" : "primary"}
        />
        <StatCard
          label="対応中"
          value={`${dev.byStatus.in_progress}件`}
          sub={`未対応 ${dev.byStatus.open}件`}
          accent="warning"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label={`${monthLabel}の完了`}
          value={`${dev.doneThisMonth}件`}
          sub={`${monthLabel}の起票 ${dev.createdThisMonth}件`}
          accent="success"
        />
        <StatCard
          label={`${STALE_DAYS}日以上 滞留`}
          value={`${dev.stale}件`}
          sub={dev.stale > 0 ? "着手の見直しが必要です" : "滞留はありません"}
          accent={dev.stale > 0 ? "danger" : "success"}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>未完了の内訳</CardTitle>
        </CardHeader>
        <CardContent>
          <SegmentedBar
            segments={[
              { label: "未対応", value: dev.byStatus.open, tone: "neutral" },
              { label: "対応中", value: dev.byStatus.in_progress, tone: "warning" },
              { label: "追加ヒアリング", value: dev.byStatus.hearing, tone: "info" },
            ]}
            emptyLabel="未完了の依頼はありません。"
          />
        </CardContent>
      </Card>

      {dev.urgent.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>急ぎの依頼</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {dev.urgent.map(({ issue, urgency }) => (
              <Link
                key={issue.id}
                href={`/dev/${issue.id}`}
                className="block rounded-md border border-border p-3 transition-colors hover:bg-muted active:bg-muted"
              >
                <div className="flex items-start gap-2">
                  <span className="tabular shrink-0 text-sm font-bold text-muted-foreground">
                    #{issue.issueNumber}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium">{issue.title}</span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <DevIssueCategoryBadge category={issue.category} />
                  <DevIssuePriorityBadge priority={issue.priority} />
                  <DevIssueStatusBadge status={issue.status} />
                  {urgentReason(urgency) && <Badge tone="danger">{urgentReason(urgency)}</Badge>}
                </div>
              </Link>
            ))}
            <Link
              href="/dev"
              className={buttonClasses({ variant: "outline", size: "sm", className: "w-full" })}
            >
              すべての依頼を見る
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/** 「なぜ急ぎなのか」を1語で示す(バッジ表示用)。該当が無ければ null。 */
function urgentReason(u: DevIssueUrgency): string | null {
  if (u.hearingAnswered) return "返信あり";
  if (u.days >= STALE_DAYS) return `${u.days}日 経過`;
  if (u.pendingApprovers.length > 0) return "承諾待ち";
  return null;
}

/* ---------------------------------------------------------------- 共通 */

function SectionHeading({
  icon: Icon,
  title,
  href,
  linkLabel,
}: {
  icon: React.ElementType;
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
        <Icon className="h-[18px] w-[18px] text-muted-foreground" />
        {title}
      </h2>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        {linkLabel}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
