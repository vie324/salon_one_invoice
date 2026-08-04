import { AlertTriangle, CalendarX, Clock, Plus, UserCheck } from "lucide-react";
import Link from "next/link";
import {
  DevIssueCategoryBadge,
  DevIssueExecutionBadge,
  DevIssuePriorityBadge,
  DevIssueStatusBadge,
} from "@/components/status-badge";
import { CompletionBanner } from "@/components/notifications/completion-banner";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { isEngineer, isProductAdmin } from "@/lib/domain/constants";
import {
  isOpenIssue,
  issueUrgency,
  pendingApprovers,
  sortByUrgency,
  STALE_DAYS,
} from "@/lib/domain/dev-issues";
import type {
  DevIssueCategory,
  DevIssuePriority,
  DevIssueStatus,
  UserProfile,
} from "@/lib/domain/types";
import { cn, formatDate } from "@/lib/utils";
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
  const [user, repo] = await Promise.all([requireUser(), getServiceRepository()]);

  // status 未指定 = 未完了のみ(完了した項目は残すが、開いた直後には出さない)
  const statusParam = sp.status ?? "";
  const openOnly = statusParam === "";

  const [issues, all] = await Promise.all([
    repo.listDevIssues({
      status: (openOnly || statusParam === "all"
        ? "all"
        : (statusParam as DevIssueStatus)) as DevIssueStatus | "all",
      category: (sp.category as DevIssueCategory | "all") ?? "all",
      priority: (sp.priority as DevIssuePriority | "all") ?? "all",
      search: sp.q,
    }),
    // サマリー・督促はフィルター前の全件で数える
    repo.listDevIssues(),
  ]);

  // 承認者(管理者)の判定に使う。読み取りに失敗しても一覧は表示する。
  let profiles: UserProfile[] = [];
  try {
    profiles = await repo.listUserProfiles();
  } catch {
    profiles = [];
  }

  const visible = sortByUrgency(openOnly ? issues.filter(isOpenIssue) : issues);
  const openIssues = all.filter(isOpenIssue);
  const urgencyOf = new Map(all.map((i) => [i.id, issueUrgency(i, profiles)]));

  const urgentBugs = openIssues.filter(
    (i) => i.category === "bug" && (i.priority === "high" || (urgencyOf.get(i.id)?.days ?? 0) >= STALE_DAYS),
  );
  const overdue = openIssues.filter((i) => urgencyOf.get(i.id)?.overdue);
  const missingSchedule = openIssues.filter((i) => urgencyOf.get(i.id)?.missingSchedule);
  const awaitingApproval = openIssues.filter(
    (i) => (urgencyOf.get(i.id)?.pendingApprovers.length ?? 0) > 0,
  );
  const myApproval = openIssues.filter((i) =>
    pendingApprovers(i, profiles).some((p) => p.id === user.id),
  );

  const engineer = isEngineer(user.roles);
  const approver = isProductAdmin(user.roles);

  return (
    <div>
      <CompletionBanner />

      <PageHeader
        title="開発進捗"
        description="不具合を最優先に、緊急度の高い順で表示します。完了した依頼は「完了」タブから確認できます。"
        actions={
          <Link href="/dev/new" className={buttonClasses()}>
            <Plus className="h-4 w-4" />
            新規依頼
          </Link>
        }
      />

      {/* 役割に応じた「いま急ぐこと」 */}
      <div className="mb-4 space-y-2">
        {approver && myApproval.length > 0 && (
          <AlertBar
            tone="danger"
            icon={<UserCheck className="h-4 w-4" />}
            title={`あなたの承諾待ちが ${myApproval.length}件あります`}
            body={`要望「${myApproval[0].title}」ほか。実行するか止めるかを判定してください。`}
            href={`/dev/${myApproval[0].id}`}
            linkLabel="判定する"
          />
        )}
        {!approver && awaitingApproval.length > 0 && (
          <AlertBar
            tone="warning"
            icon={<UserCheck className="h-4 w-4" />}
            title={`承諾待ちの要望が ${awaitingApproval.length}件あります`}
            body={`確認待ち: ${[
              ...new Set(awaitingApproval.flatMap((i) => urgencyOf.get(i.id)?.pendingApprovers ?? [])),
            ].join("、")} — 承諾されるまで着手できません。`}
            href={`/dev/${awaitingApproval[0].id}`}
            linkLabel="確認する"
          />
        )}
        {engineer && overdue.length > 0 && (
          <AlertBar
            tone="danger"
            icon={<CalendarX className="h-4 w-4" />}
            title={`完了予定日を過ぎた依頼が ${overdue.length}件あります`}
            body="予定日を更新するか、対応を完了してください。"
            href={`/dev/${overdue[0].id}`}
            linkLabel="対応する"
          />
        )}
        {engineer && missingSchedule.length > 0 && (
          <AlertBar
            tone="warning"
            icon={<Clock className="h-4 w-4" />}
            title={`完了予定日が未記入の依頼が ${missingSchedule.length}件あります`}
            body="いつ対応できるかを入力してください。依頼者が状況を追えるようになります。"
            href={`/dev/${missingSchedule[0].id}`}
            linkLabel="予定日を入力"
          />
        )}
        {!engineer && missingSchedule.length > 0 && (
          <AlertBar
            tone="warning"
            icon={<Clock className="h-4 w-4" />}
            title={`完了予定日が未記入の依頼が ${missingSchedule.length}件あります`}
            body="エンジニアへ完了予定日の記入を依頼してください。"
            href={`/dev/${missingSchedule[0].id}`}
            linkLabel="確認する"
          />
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile
          label="要対応の不具合"
          value={urgentBugs.length}
          href="/dev?category=bug"
          tone="danger"
        />
        <SummaryTile label="予定日 超過" value={overdue.length} href="/dev" tone="danger" />
        <SummaryTile label="予定日 未記入" value={missingSchedule.length} href="/dev" tone="warning" />
        <SummaryTile
          label={approver ? "あなたの承諾待ち" : "承諾待ちの要望"}
          value={approver ? myApproval.length : awaitingApproval.length}
          href="/dev?category=request"
          tone="info"
        />
      </div>

      <Card className="p-4">
        <IssueFilters
          status={statusParam}
          category={sp.category ?? "all"}
          query={sp.q ?? ""}
        />
        {visible.length === 0 ? (
          <EmptyState
            title={openOnly ? "未完了の依頼はありません" : "該当する依頼はありません"}
            description={
              openOnly
                ? "対応が必要な依頼はすべて片付いています。完了した依頼は「完了」タブから確認できます。"
                : "条件を変えて検索してください。"
            }
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
              {visible.map((i) => {
                const u = urgencyOf.get(i.id) ?? issueUrgency(i, profiles);
                return (
                  <TR key={i.id} className={cn(u.urgent && "bg-destructive/5")}>
                    <TD className="tabular text-xs text-muted-foreground">#{i.issueNumber}</TD>
                    <TD className="whitespace-nowrap text-xs">
                      {formatDate(i.createdAt)}
                      {u.open && u.days >= STALE_DAYS && (
                        <div
                          className={cn(
                            "tabular text-[11px]",
                            i.category === "bug" ? "text-destructive" : "text-warning",
                          )}
                        >
                          {u.days}日経過
                        </div>
                      )}
                    </TD>
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
                      <Link
                        href={`/dev/${i.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {i.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{i.requesterName}</span>
                        {u.overdue && (
                          <Badge tone="danger">
                            <AlertTriangle className="h-3 w-3" />
                            予定日 超過
                          </Badge>
                        )}
                        {u.missingSchedule && <Badge tone="warning">予定日 未記入</Badge>}
                        {u.pendingApprovers.length > 0 && (
                          <Badge tone="info">{u.pendingApprovers.join("・")} の承諾待ち</Badge>
                        )}
                      </div>
                    </TD>
                    <TD
                      className={cn(
                        "whitespace-nowrap text-xs",
                        u.overdue && "font-medium text-destructive",
                      )}
                    >
                      {formatDate(i.scheduledDate)}
                    </TD>
                    <TD className="whitespace-nowrap text-xs">{formatDate(i.completedDate)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

/** 役割ごとの督促バー */
function AlertBar({
  tone,
  icon,
  title,
  body,
  href,
  linkLabel,
}: {
  tone: "danger" | "warning";
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
}) {
  const cls =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-warning/40 bg-warning/10 text-warning";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2.5", cls)}>
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </span>
      <span className="text-xs text-foreground/80">{body}</span>
      <Link
        href={href}
        className={buttonClasses({ variant: "outline", size: "sm", className: "ml-auto bg-card" })}
      >
        {linkLabel}
      </Link>
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
  tone: "neutral" | "warning" | "info" | "success" | "danger";
}) {
  const toneCls = {
    neutral: "text-foreground",
    warning: "text-warning",
    info: "text-info",
    success: "text-success",
    danger: "text-destructive",
  }[tone];
  return (
    <Link
      href={href}
      className="rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`tabular mt-0.5 text-lg font-bold ${value === 0 ? "text-muted-foreground" : toneCls}`}>
        {value}件
      </div>
    </Link>
  );
}
