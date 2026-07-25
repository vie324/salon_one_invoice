import { Plus } from "lucide-react";
import Link from "next/link";
import {
  DevIssueCategoryBadge,
  DevIssueExecutionBadge,
  DevIssuePriorityBadge,
  DevIssueStatusBadge,
} from "@/components/status-badge";
import { CompletionBanner } from "@/components/notifications/completion-banner";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { getServiceRepository } from "@/lib/data";
import type { DevIssueCategory, DevIssuePriority, DevIssueStatus } from "@/lib/domain/types";
import { formatDate } from "@/lib/utils";
import { IssueFilters } from "./issue-filters";

export const metadata = { title: "開発進捗" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function DevIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; priority?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const repo = await getServiceRepository();
  const issues = await repo.listDevIssues({
    status: (sp.status as DevIssueStatus | "all") ?? "all",
    category: (sp.category as DevIssueCategory | "all") ?? "all",
    priority: (sp.priority as DevIssuePriority | "all") ?? "all",
    search: sp.q,
  });

  // サマリーはフィルター前の全件で数える
  const all = await repo.listDevIssues();
  const thisMonth = new Date().toISOString().slice(0, 7);
  const counts = {
    open: all.filter((i) => i.status === "open").length,
    inProgress: all.filter((i) => i.status === "in_progress").length,
    hearing: all.filter((i) => i.status === "hearing").length,
    doneThisMonth: all.filter(
      (i) => i.status === "done" && (i.completedDate ?? "").startsWith(thisMonth),
    ).length,
  };

  return (
    <div>
      <CompletionBanner />

      <PageHeader
        title="開発進捗"
        description="Salon One への開発依頼・不具合報告と対応状況を一元管理します。記載日・依頼者はアカウントから自動記録されます。"
        actions={
          <Link href="/dev/new" className={buttonClasses()}>
            <Plus className="h-4 w-4" />
            新規依頼
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile label="未対応" value={counts.open} href="/dev?status=open" tone="neutral" />
        <SummaryTile label="対応中" value={counts.inProgress} href="/dev?status=in_progress" tone="warning" />
        <SummaryTile label="追加ヒアリング" value={counts.hearing} href="/dev?status=hearing" tone="info" />
        <SummaryTile label="今月の対応完了" value={counts.doneThisMonth} href="/dev?status=done" tone="success" />
      </div>

      <Card className="p-4">
        <IssueFilters
          status={sp.status ?? "all"}
          category={sp.category ?? "all"}
          query={sp.q ?? ""}
        />
        {issues.length === 0 ? (
          <EmptyState
            title="開発依頼はまだありません"
            description="不具合の報告や機能の要望を「新規依頼」から登録してください。"
            action={
              <Link href="/dev/new" className={buttonClasses({ size: "sm" })}>
                <Plus className="h-4 w-4" />
                新規依頼
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-14">No</TH>
                <TH className="whitespace-nowrap">記載日</TH>
                <TH>分類</TH>
                <TH>優先度</TH>
                <TH className="whitespace-nowrap">ステータス</TH>
                <TH className="whitespace-nowrap">実行有無</TH>
                <TH className="min-w-[240px]">課題名 / 依頼者</TH>
                <TH className="whitespace-nowrap">完了予定</TH>
                <TH className="whitespace-nowrap">完了日</TH>
              </TR>
            </THead>
            <TBody>
              {issues.map((i) => (
                <TR key={i.id}>
                  <TD className="tabular text-xs text-muted-foreground">#{i.issueNumber}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatDate(i.createdAt)}</TD>
                  <TD>
                    <DevIssueCategoryBadge category={i.category} />
                  </TD>
                  <TD>
                    <DevIssuePriorityBadge priority={i.priority} />
                  </TD>
                  <TD>
                    <DevIssueStatusBadge status={i.status} />
                  </TD>
                  <TD>
                    <DevIssueExecutionBadge execution={i.execution} muted={i.category === "bug"} />
                  </TD>
                  <TD>
                    <Link href={`/dev/${i.id}`} className="font-medium hover:text-primary hover:underline">
                      {i.title}
                    </Link>
                    <div className="mt-0.5 text-xs text-muted-foreground">{i.requesterName}</div>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{formatDate(i.scheduledDate)}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatDate(i.completedDate)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone: "neutral" | "warning" | "info" | "success";
}) {
  const toneCls = {
    neutral: "text-foreground",
    warning: "text-warning",
    info: "text-info",
    success: "text-success",
  }[tone];
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`tabular mt-0.5 text-lg font-bold ${toneCls}`}>{value}件</div>
    </Link>
  );
}
