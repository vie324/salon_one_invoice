import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CircleDollarSign,
  Clock,
  FileText,
  Plus,
  Repeat,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { DonutChart, type DonutSlice } from "@/components/charts/donut-chart";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { CompletionBanner } from "@/components/notifications/completion-banner";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { getCurrentUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { formatBillingPeriod, outstandingAmount } from "@/lib/domain/calculations";
import { paymentMethodLabels } from "@/lib/domain/constants";
import type { PaymentMethod } from "@/lib/domain/types";
import { daysUntil, formatDate, formatJPY } from "@/lib/utils";

export const metadata = { title: "ダッシュボード" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

const methodColor: Record<PaymentMethod | "adjustment", number> = {
  direct_debit: 1,
  bank_transfer: 2,
  credit_card: 3,
  cash: 4,
  adjustment: 5,
};

export default async function DashboardPage() {
  const [user, repo] = await Promise.all([getCurrentUser(), getServiceRepository()]);
  const [metrics, activities, invoices, bankTxns] = await Promise.all([
    repo.getDashboardMetrics(),
    repo.listActivities(8),
    repo.listInvoices(),
    repo.listBankTransactions(),
  ]);

  const drafts = invoices.filter((i) => i.status === "draft");
  const awaiting = invoices.filter((i) => i.status === "awaiting_payment");
  const needsFollow = invoices.filter((i) => i.status === "overdue" || i.status === "failed");
  const unmatched = bankTxns.filter((t) => !t.matchedInvoiceId);

  const donutSlices: DonutSlice[] = metrics.collectionByMethod
    .map((c) => ({
      label: paymentMethodLabels[c.method as PaymentMethod] ?? "調整",
      value: c.amount,
      colorIndex: methodColor[c.method],
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      {/* エラー対応完了などのお知らせ(未読があるあいだトップに表示) */}
      <CompletionBanner />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            こんにちは、{user.name.replace(/（.*/, "")} さん
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            売上・入金の状況と、本日の要対応をまとめました。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/invoices/new" className={buttonClasses({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            請求書を作成
          </Link>
          <Link
            href="/payments"
            className={buttonClasses({ variant: "outline", size: "sm" })}
          >
            <Wallet className="h-4 w-4" />
            入金を確認
          </Link>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="今月の請求額"
          value={formatJPY(metrics.monthInvoiced)}
          delta={metrics.invoicedMoM}
          sub="前月比"
          icon={<FileText className="h-5 w-5" />}
          accent="primary"
        />
        <StatCard
          label="今月の入金額"
          value={formatJPY(metrics.monthCollected)}
          sub={`${paymentMethodLabels.direct_debit}中心`}
          icon={<CircleDollarSign className="h-5 w-5" />}
          accent="success"
        />
        <StatCard
          label="未収金"
          value={formatJPY(metrics.outstanding)}
          sub={`入金待ち ${metrics.awaitingCount}件`}
          icon={<Clock className="h-5 w-5" />}
          accent="warning"
        />
        <StatCard
          label="MRR（月次経常収益）"
          value={formatJPY(metrics.mrr)}
          sub={`定期契約 ${metrics.activeSubscriptions}件`}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="primary"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左: グラフ or タスク */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>売上・入金の推移</CardTitle>
              <span className="text-xs text-muted-foreground">直近6ヶ月</span>
            </CardHeader>
            <CardContent>
              <RevenueChart data={metrics.monthlyTrend} />
            </CardContent>
          </Card>

          {/* 要対応 */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>要対応タスク</CardTitle>
              <Link
                href="/invoices"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                すべての請求書 <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <TaskChip href="/invoices?status=draft" label="下書き" count={drafts.length} tone="neutral" />
                <TaskChip href="/invoices?status=awaiting_payment" label="入金待ち" count={awaiting.length} tone="warning" />
                <TaskChip href="/invoices?status=overdue" label="期限超過・失敗" count={needsFollow.length} tone="danger" />
                <TaskChip href="/payments" label="未消込入金" count={unmatched.length} tone="info" />
              </div>

              {needsFollow.length > 0 ? (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {needsFollow.slice(0, 5).map((inv) => (
                    <li key={inv.id}>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <InvoiceStatusBadge status={inv.status} />
                          <span className="truncate font-medium">{inv.customer?.name}</span>
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {inv.invoiceNumber}
                          </span>
                        </span>
                        <span className="flex items-center gap-3 whitespace-nowrap">
                          <span className="text-xs text-destructive">
                            {daysUntil(inv.dueDate) < 0
                              ? `${Math.abs(daysUntil(inv.dueDate))}日超過`
                              : "要確認"}
                          </span>
                          <span className="tabular font-semibold">
                            {formatJPY(outstandingAmount(inv))}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="要フォローの請求はありません" description="期限超過・引落失敗はありません。" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右: 内訳 + アクティビティ */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>今月の入金内訳</CardTitle>
            </CardHeader>
            <CardContent>
              {donutSlices.length > 0 ? (
                <DonutChart slices={donutSlices} centerLabel="今月入金" />
              ) : (
                <EmptyState title="今月の入金はまだありません" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>最近の動き</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <ActivityIcon kind={a.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="leading-snug">{a.message}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {a.actor} ・ {formatDate(a.createdAt)}
                        {a.amount != null && ` ・ ${formatJPY(a.amount)}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>顧客・契約</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <MiniStat icon={<Users className="h-4 w-4" />} label="稼働顧客" value={`${metrics.activeCustomers}`} />
              <MiniStat icon={<Repeat className="h-4 w-4" />} label="定期契約" value={`${metrics.activeSubscriptions}`} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TaskChip({
  href,
  label,
  count,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  tone: "neutral" | "warning" | "danger" | "info";
}) {
  const toneCls = {
    neutral: "text-foreground",
    warning: "text-warning",
    danger: "text-destructive",
    info: "text-info",
  }[tone];
  return (
    <Link
      href={href}
      className="rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/50"
    >
      <div className={`tabular text-xl font-bold ${toneCls}`}>{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Link>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <div className="tabular text-lg font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function ActivityIcon({ kind }: { kind: string }) {
  const map: Record<string, React.ReactNode> = {
    invoice_sent: <FileText className="h-4 w-4" />,
    invoice_created: <FileText className="h-4 w-4" />,
    payment_confirmed: <Banknote className="h-4 w-4" />,
    batch_processed: <Banknote className="h-4 w-4" />,
    subscription_created: <Repeat className="h-4 w-4" />,
    customer_created: <Users className="h-4 w-4" />,
  };
  return (
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
      {map[kind] ?? <FileText className="h-4 w-4" />}
    </span>
  );
}
