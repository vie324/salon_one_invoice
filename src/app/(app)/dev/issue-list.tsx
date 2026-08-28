"use client";

import { AlertTriangle, ChevronDown, ChevronUp, GripVertical, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { reorderDevIssuesAction } from "@/app/actions/dev-issues";
import {
  DevIssueCategoryBadge,
  DevIssueExecutionBadge,
  DevIssuePriorityBadge,
  DevIssueStatusBadge,
} from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { STALE_DAYS, type DevIssueUrgency } from "@/lib/domain/dev-issues";
import type {
  DevIssueCategory,
  DevIssueExecution,
  DevIssuePriority,
  DevIssueStatus,
} from "@/lib/domain/types";
import { cn, formatDate } from "@/lib/utils";

/** 一覧の1行(サーバーで算出した督促情報つき) */
export interface DevIssueRow {
  id: string;
  issueNumber: number;
  title: string;
  category: DevIssueCategory;
  priority: DevIssuePriority;
  status: DevIssueStatus;
  execution: DevIssueExecution;
  requesterName: string;
  createdAt: string;
  desiredDate: string | null;
  scheduledDate: string | null;
  completedDate: string | null;
  urgency: DevIssueUrgency;
}

/**
 * 開発依頼の一覧。
 * manual=true のときは行をドラッグ（または上下ボタン）で入れ替えられ、
 * 並び順はそのまま保存される。対応の順番を人が決められるようにするためのもの。
 */
export function IssueList({ rows, manual }: { rows: DevIssueRow[]; manual: boolean }) {
  const router = useRouter();
  const [order, setOrder] = React.useState(rows);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  // サーバー側の並び・絞り込みが変わったら反映する
  React.useEffect(() => setOrder(rows), [rows]);

  const save = (next: DevIssueRow[]) => {
    setOrder(next);
    start(async () => {
      setError(null);
      const res = await reorderDevIssuesAction(next.map((r) => r.id));
      if (!res.ok) {
        setError(res.error);
        setOrder(rows); // 保存に失敗したら元に戻す
        return;
      }
      setNotice("並び順を保存しました");
      window.setTimeout(() => setNotice(null), 2000);
      router.refresh();
    });
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    save(next);
  };

  return (
    <div className="space-y-2">
      {manual && (
        <p className="text-xs text-muted-foreground">
          行の左端（
          <GripVertical className="inline h-3.5 w-3.5 align-text-bottom" />
          ）をつかんで上下にドラッグすると、対応の順番を入れ替えられます。矢印ボタンでも動かせます。
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && !error && <p className="text-xs text-success">{notice}</p>}

      <Table>
        <THead>
          <TR>
            {manual && <TH className="w-16">順番</TH>}
            <TH className="w-14">No</TH>
            <TH className="whitespace-nowrap">記載日</TH>
            <TH>分類</TH>
            <TH>優先度</TH>
            <TH className="whitespace-nowrap">ステータス</TH>
            <TH className="whitespace-nowrap">実行有無</TH>
            <TH className="min-w-[240px]">課題名 / 依頼者</TH>
            <TH className="whitespace-nowrap">希望日</TH>
            <TH className="whitespace-nowrap">完了予定</TH>
            <TH className="whitespace-nowrap">完了日</TH>
          </TR>
        </THead>
        <TBody>
          {order.map((row, index) => {
            const u = row.urgency;
            return (
              <TR
                key={row.id}
                draggable={manual}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => {
                  if (!manual || dragIndex === null) return;
                  e.preventDefault();
                  setOverIndex(index);
                }}
                onDrop={(e) => {
                  if (!manual || dragIndex === null) return;
                  e.preventDefault();
                  move(dragIndex, index);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={cn(
                  u.urgent && "bg-destructive/5",
                  manual && "cursor-grab",
                  dragIndex === index && "opacity-40",
                  overIndex === index && dragIndex !== index && "border-t-2 border-primary",
                )}
              >
                {manual && (
                  <TD>
                    <div className="flex items-center gap-0.5 text-muted-foreground">
                      <GripVertical className="h-4 w-4 shrink-0" aria-hidden />
                      <div className="flex flex-col">
                        <button
                          type="button"
                          className="rounded p-0.5 hover:bg-muted hover:text-foreground disabled:opacity-30"
                          disabled={pending || index === 0}
                          onClick={() => move(index, index - 1)}
                          aria-label={`#${row.issueNumber} を上へ`}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-0.5 hover:bg-muted hover:text-foreground disabled:opacity-30"
                          disabled={pending || index === order.length - 1}
                          onClick={() => move(index, index + 1)}
                          aria-label={`#${row.issueNumber} を下へ`}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </TD>
                )}
                <TD className="tabular text-xs text-muted-foreground">#{row.issueNumber}</TD>
                <TD className="whitespace-nowrap text-xs">
                  {formatDate(row.createdAt)}
                  {u.open && u.days >= STALE_DAYS && (
                    <div
                      className={cn(
                        "tabular text-[11px]",
                        row.category === "bug" ? "text-destructive" : "text-warning",
                      )}
                    >
                      {u.days}日経過
                    </div>
                  )}
                </TD>
                <TD className="whitespace-nowrap">
                  <DevIssueCategoryBadge category={row.category} />
                </TD>
                <TD className="whitespace-nowrap">
                  <DevIssuePriorityBadge priority={row.priority} />
                </TD>
                <TD>
                  <DevIssueStatusBadge status={row.status} />
                </TD>
                <TD>
                  <DevIssueExecutionBadge
                    execution={row.execution}
                    muted={row.category === "bug"}
                  />
                </TD>
                <TD>
                  <Link
                    href={`/dev/${row.id}`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {row.title}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{row.requesterName}</span>
                    {u.desiredPassed && (
                      <Badge tone="danger">
                        <AlertTriangle className="h-3 w-3" />
                        希望日 超過
                      </Badge>
                    )}
                    {u.overdue && <Badge tone="danger">予定日 超過</Badge>}
                    {u.laterThanDesired && <Badge tone="warning">希望日に間に合わない予定</Badge>}
                    {u.missingSchedule && <Badge tone="warning">予定日 未記入</Badge>}
                    {u.hearingAnswered && (
                      <Badge tone="info">
                        <MessageSquare className="h-3 w-3" />
                        ヒアリング返信あり
                      </Badge>
                    )}
                    {u.hearingAwaitingReply && (
                      <Badge tone="warning">
                        <MessageSquare className="h-3 w-3" />
                        ヒアリング返信待ち
                      </Badge>
                    )}
                    {u.pendingApprovers.length > 0 && (
                      <Badge tone="info">{u.pendingApprovers.join("・")} の承諾待ち</Badge>
                    )}
                  </div>
                </TD>
                <TD
                  className={cn(
                    "whitespace-nowrap text-xs",
                    u.desiredPassed && "font-medium text-destructive",
                  )}
                >
                  {formatDate(row.desiredDate)}
                </TD>
                <TD
                  className={cn(
                    "whitespace-nowrap text-xs",
                    u.overdue && "font-medium text-destructive",
                    !u.overdue && u.laterThanDesired && "font-medium text-warning",
                  )}
                >
                  {formatDate(row.scheduledDate)}
                </TD>
                <TD className="whitespace-nowrap text-xs">{formatDate(row.completedDate)}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
