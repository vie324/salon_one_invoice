import { CalendarX, Clock, GripVertical, MessageSquare, Plus, UserCheck } from "lucide-react";
import Link from "next/link";
import { CompletionBanner } from "@/components/notifications/completion-banner";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { isEngineer, isProductAdmin } from "@/lib/domain/constants";
import {
  isOpenIssue,
  issueUrgency,
  pendingApprovers,
  sortByManualOrder,
  sortByUrgency,
  STALE_DAYS,
} from "@/lib/domain/dev-issues";
import type {
  DevIssueCategory,
  DevIssuePriority,
  DevIssueStatus,
  UserProfile,
} from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { IssueFilters } from "./issue-filters";
import { IssueList } from "./issue-list";

export const metadata = { title: "開発進捗" };

// 一覧はデータ依存のため常にサーバーで描画する(静的化するとビルド時データが焼き込まれる)
export const dynamic = "force-dynamic";

export default async function DevIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    priority?: string;
    q?: string;
    sort?: string;
  }>;
}) {
  const sp = await searchParams;
  const [user, repo] = await Promise.all([requireUser(), getServiceRepository()]);

  // status 未指定 = 未完了のみ(完了した項目は残すが、開いた直後には出さない)
  const statusParam = sp.status ?? "";
  const openOnly = statusParam === "";
  // sort=manual のときは手動の並び順(ドラッグで入れ替え)
  const manual = sp.sort === "manual";

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

  const filtered = openOnly ? issues.filter(isOpenIssue) : issues;
  const visible = manual ? sortByManualOrder(filtered) : sortByUrgency(filtered);
  const openIssues = all.filter(isOpenIssue);
  const urgencyOf = new Map(all.map((i) => [i.id, issueUrgency(i, profiles)]));

  const urgentBugs = openIssues.filter(
    (i) => i.category === "bug" && (i.priority === "high" || (urgencyOf.get(i.id)?.days ?? 0) >= STALE_DAYS),
  );
  const overdue = openIssues.filter((i) => urgencyOf.get(i.id)?.overdue);
  const missingSchedule = openIssues.filter((i) => urgencyOf.get(i.id)?.missingSchedule);
  const desiredPassed = openIssues.filter((i) => urgencyOf.get(i.id)?.desiredPassed);
  const awaitingApproval = openIssues.filter(
    (i) => (urgencyOf.get(i.id)?.pendingApprovers.length ?? 0) > 0,
  );
  const myApproval = openIssues.filter((i) =>
    pendingApprovers(i, profiles).some((p) => p.id === user.id),
  );
  // 追加ヒアリング: 返信が届いている(エンジニアの番) / 返信待ち(依頼者の番)
  const hearingAnswered = openIssues.filter((i) => urgencyOf.get(i.id)?.hearingAnswered);
  const hearingAwaiting = openIssues.filter((i) => urgencyOf.get(i.id)?.hearingAwaitingReply);
  const myHearing = hearingAwaiting.filter((i) => i.requesterId === user.id);

  const engineer = isEngineer(user.roles);
  const approver = isProductAdmin(user.roles);

  return (
    <div>
      <CompletionBanner />

      <PageHeader
        title="開発進捗"
        description={
          manual
            ? "ドラッグで対応の順番を入れ替えられます。完了した依頼は「完了」タブから確認できます。"
            : "不具合を最優先に、緊急度の高い順で表示します。完了した依頼は「完了」タブから確認できます。"
        }
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
        {myHearing.length > 0 && (
          <AlertBar
            tone="danger"
            icon={<MessageSquare className="h-4 w-4" />}
            title={`あなたへの追加ヒアリングが ${myHearing.length}件あります`}
            body={`「${myHearing[0].title}」ほか。返信を追記するとエンジニアへ通知され、対応が再開します。`}
            href={`/dev/${myHearing[0].id}`}
            linkLabel="返信する"
          />
        )}
        {engineer && hearingAnswered.length > 0 && (
          <AlertBar
            tone="warning"
            icon={<MessageSquare className="h-4 w-4" />}
            title={`追加ヒアリングに返信が ${hearingAnswered.length}件届いています`}
            body={`「${hearingAnswered[0].title}」ほか。内容を確認して、ステータスを「対応中」に戻してください。`}
            href={`/dev/${hearingAnswered[0].id}`}
            linkLabel="返信を読む"
          />
        )}
        {!engineer && hearingAwaiting.length > myHearing.length && (
          <AlertBar
            tone="warning"
            icon={<MessageSquare className="h-4 w-4" />}
            title={`返信待ちの追加ヒアリングが ${hearingAwaiting.length - myHearing.length}件あります`}
            body="依頼者の返信が無いあいだ対応は進みません。回答をお願いしてください。"
            href={`/dev/${(hearingAwaiting.find((i) => i.requesterId !== user.id) ?? hearingAwaiting[0]).id}`}
            linkLabel="確認する"
          />
        )}
        {desiredPassed.length > 0 && (
          <AlertBar
            tone="danger"
            icon={<CalendarX className="h-4 w-4" />}
            title={`依頼者の希望日を過ぎた依頼が ${desiredPassed.length}件あります`}
            body="依頼側が「この日までに」と指定した日を過ぎています。対応状況を共有してください。"
            href={`/dev/${desiredPassed[0].id}`}
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

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <SummaryTile
          label="要対応の不具合"
          value={urgentBugs.length}
          href="/dev?category=bug"
          tone="danger"
        />
        <SummaryTile label="希望日 超過" value={desiredPassed.length} href="/dev" tone="danger" />
        <SummaryTile label="予定日 未記入" value={missingSchedule.length} href="/dev" tone="warning" />
        <SummaryTile
          label={approver ? "あなたの承諾待ち" : "承諾待ちの要望"}
          value={approver ? myApproval.length : awaitingApproval.length}
          href="/dev?category=request"
          tone="info"
        />
        <SummaryTile
          label={engineer ? "ヒアリング返信あり" : "あなたへのヒアリング"}
          value={engineer ? hearingAnswered.length : myHearing.length}
          href="/dev?status=hearing"
          tone={engineer ? "warning" : "danger"}
        />
      </div>

      <Card className="p-3 sm:p-4">
        <IssueFilters
          status={statusParam}
          category={sp.category ?? "all"}
          query={sp.q ?? ""}
        />

        {/* 並び順: 自動(緊急度) / 手動(ドラッグで入替) */}
        <div className="snap-rail -mx-1 mb-3 items-center gap-1.5 px-1 text-xs lg:flex-wrap">
          <span className="self-center whitespace-nowrap text-muted-foreground">並び順:</span>
          <Link
            href={sortHref(sp, null)}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3.5 font-medium transition-colors",
              manual
                ? "bg-muted text-muted-foreground hover:text-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            緊急度順（自動）
          </Link>
          <Link
            href={sortHref(sp, "manual")}
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-full px-3.5 font-medium transition-colors",
              manual
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            <GripVertical className="h-3.5 w-3.5" />
            手動（ドラッグで入替）
          </Link>
        </div>
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
          <IssueList
            manual={manual}
            rows={visible.map((i) => ({
              id: i.id,
              issueNumber: i.issueNumber,
              title: i.title,
              category: i.category,
              priority: i.priority,
              status: i.status,
              execution: i.execution,
              requesterName: i.requesterName,
              createdAt: i.createdAt,
              desiredDate: i.desiredDate,
              scheduledDate: i.scheduledDate,
              completedDate: i.completedDate,
              urgency: urgencyOf.get(i.id) ?? issueUrgency(i, profiles),
            }))}
          />
        )}
      </Card>
    </div>
  );
}

/** 現在の絞り込みを保ったまま並び順だけ切り替えるリンク先 */
function sortHref(
  sp: { status?: string; category?: string; priority?: string; q?: string },
  sort: "manual" | null,
): string {
  const params = new URLSearchParams();
  if (sp.status) params.set("status", sp.status);
  if (sp.category && sp.category !== "all") params.set("category", sp.category);
  if (sp.priority && sp.priority !== "all") params.set("priority", sp.priority);
  if (sp.q) params.set("q", sp.q);
  if (sort) params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/dev?${qs}` : "/dev";
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
    <div
      className={cn(
        "rounded-md border px-3 py-2.5",
        // スマホは縦積み、PC は1行に収める
        "flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1",
        cls,
      )}
    >
      <span className="flex items-start gap-1.5 text-sm font-semibold">
        <span className="mt-0.5 shrink-0">{icon}</span>
        {title}
      </span>
      <span className="text-xs leading-relaxed text-foreground/80">{body}</span>
      <Link
        href={href}
        className={buttonClasses({
          variant: "outline",
          size: "sm",
          className: "w-full bg-card sm:ml-auto sm:w-auto",
        })}
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
      className="rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted/50 active:bg-muted sm:px-4 sm:py-3"
    >
      <div className="text-[11px] leading-tight text-muted-foreground sm:text-xs">{label}</div>
      <div className={`tabular mt-0.5 text-lg font-bold ${value === 0 ? "text-muted-foreground" : toneCls}`}>
        {value}件
      </div>
    </Link>
  );
}
