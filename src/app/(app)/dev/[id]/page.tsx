import { ArrowLeft, CalendarCheck, CalendarClock, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachmentsPanel } from "@/components/dev/attachments-panel";
import {
  DevIssueCategoryBadge,
  DevIssueExecutionBadge,
  DevIssuePriorityBadge,
  DevIssueStatusBadge,
} from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { isProductAdmin } from "@/lib/domain/constants";
import { issueUrgency, pendingApprovers } from "@/lib/domain/dev-issues";
import type { UserProfile } from "@/lib/domain/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ApprovalPanel, EngineerForm, RequestEditForm } from "./issue-detail-client";

export const metadata = { title: "開発依頼の詳細" };

export const dynamic = "force-dynamic";
// AIモック生成(Claude API 呼び出し)が10秒を超えることがあるため延長
export const maxDuration = 60;

export default async function DevIssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, repo] = await Promise.all([requireUser(), getServiceRepository()]);
  const issue = await repo.getDevIssue(id);
  if (!issue) notFound();
  const attachments = await repo.listDevIssueAttachments(issue.id);

  const admin = isProductAdmin(user.roles);
  const canEditRequest = admin || issue.requesterId === user.id;

  // 承認者(管理者)のうち、まだ判定していない人を出して確認を促す
  let profiles: UserProfile[] = [];
  try {
    profiles = await repo.listUserProfiles();
  } catch {
    profiles = [];
  }
  const approvers = profiles.filter((p) => isProductAdmin(p.roles));
  const pending = pendingApprovers(issue, profiles);
  const urgency = issueUrgency(issue, profiles);

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/dev"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          開発進捗一覧へ
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">#{issue.issueNumber}</div>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight sm:text-2xl">{issue.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DevIssueCategoryBadge category={issue.category} />
            <DevIssuePriorityBadge priority={issue.priority} />
            <DevIssueStatusBadge status={issue.status} />
            {issue.category === "request" && (
              <DevIssueExecutionBadge execution={issue.execution} />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>詳細（修正や不具合の中身）</CardTitle>
            </CardHeader>
            <CardContent>
              {issue.detail ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{issue.detail}</p>
              ) : (
                <p className="text-sm text-muted-foreground">詳細は未記入です。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>開発対応内容（エンジニアの追記）</CardTitle>
            </CardHeader>
            <CardContent>
              {issue.devNote ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{issue.devNote}</p>
              ) : (
                <p className="text-sm text-muted-foreground">まだ追記はありません。</p>
              )}
            </CardContent>
          </Card>

          <AttachmentsPanel
            issueId={issue.id}
            issueTitle={issue.title}
            attachments={attachments}
            currentUserId={user.id}
            isAdmin={admin}
          />

          {canEditRequest && (
            <RequestEditForm
              issueId={issue.id}
              title={issue.title}
              detail={issue.detail}
              category={issue.category}
              priority={issue.priority}
              desiredDate={issue.desiredDate}
            />
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>概要</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <MetaRow icon={<User className="h-4 w-4" />} label="依頼者" value={issue.requesterName} />
              <MetaRow
                icon={<CalendarClock className="h-4 w-4" />}
                label="記載日"
                value={formatDate(issue.createdAt)}
              />
              <MetaRow
                icon={<CalendarClock className="h-4 w-4" />}
                label="完了してほしい日（依頼者の希望）"
                value={formatDate(issue.desiredDate)}
              />
              <MetaRow
                icon={<CalendarClock className="h-4 w-4" />}
                label="対応完了予定日（エンジニア）"
                value={formatDate(issue.scheduledDate)}
              />
              {urgency.laterThanDesired && (
                <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs">
                  対応完了予定日が希望日より後です。依頼者へ相談するか、予定日の見直しをご検討ください。
                </p>
              )}
              {urgency.desiredPassed && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs">
                  希望されていた完了日を過ぎています。対応状況の共有をお願いします。
                </p>
              )}
              <MetaRow
                icon={<CalendarCheck className="h-4 w-4" />}
                label="対応完了日"
                value={formatDate(issue.completedDate)}
              />
              <p className="pt-1 text-xs text-muted-foreground">
                最終更新: {formatDateTime(issue.updatedAt)}
              </p>
            </CardContent>
          </Card>

          <EngineerForm
            issueId={issue.id}
            status={issue.status}
            scheduledDate={issue.scheduledDate}
            completedDate={issue.completedDate}
            devNote={issue.devNote}
          />

          {issue.category === "request" && (
            <ApprovalPanel
              issueId={issue.id}
              execution={issue.execution}
              executionSetByName={issue.executionSetByName}
              executionSetAt={issue.executionSetAt}
              approvals={issue.approvals}
              currentUserId={user.id}
              isAdmin={admin}
              approverCount={Math.max(1, approvers.length)}
              pendingApproverNames={pending.map((p) => p.name)}
              isMinePending={pending.some((p) => p.id === user.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}
