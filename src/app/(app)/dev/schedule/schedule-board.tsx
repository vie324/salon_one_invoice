"use client";

import {
  CalendarRange,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { reorderDevScheduleItemsAction } from "@/app/actions/dev-schedule";
import { DevIssueStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  devSchedulePriorityStars,
  devScheduleStatusLabels,
  devScheduleStatusTone,
} from "@/lib/domain/constants";
import {
  formatShortDate,
  scheduleProgress,
  weekShareText,
  type WeekRange,
} from "@/lib/domain/dev-schedule";
import type { DevScheduleItem, DevScheduleLinkedIssue } from "@/lib/domain/types";
import { copyText } from "@/lib/share";
import { cn, formatMonthKey } from "@/lib/utils";
import { emptyDraft, ScheduleItemDialog, type ScheduleItemDraft } from "./item-dialog";
import { ViewerPanel, type ScheduleMember } from "./viewer-panel";

/** 表示用の行(サーバーで月を確定させたもの) */
export type ScheduleRow = DevScheduleItem & { month: string | null };

export function ScheduleBoard({
  editable,
  week,
  weekLabel,
  months,
  items,
  thisWeekIds,
  carriedOverIds,
  members,
}: {
  editable: boolean;
  week: WeekRange;
  weekLabel: string;
  months: string[];
  items: ScheduleRow[];
  thisWeekIds: string[];
  carriedOverIds: string[];
  members: ScheduleMember[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<ScheduleItemDraft | null>(null);
  // 並べ替えは押した直後に画面へ反映し、保存はその後ろで行う
  const [order, setOrder] = React.useState<string[]>(items.map((i) => i.id));
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    setOrder(items.map((i) => i.id));
  }, [items]);

  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = order.map((id) => byId.get(id)).filter((i): i is ScheduleRow => !!i);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrder(next);
    startTransition(async () => {
      const res = await reorderDevScheduleItemsAction(next);
      // 保存に失敗したらサーバーの並びへ戻す
      if (!res.ok) setOrder(items.map((i) => i.id));
      router.refresh();
    });
  };
  const thisWeek = thisWeekIds.map((id) => byId.get(id)).filter((i): i is ScheduleRow => !!i);
  const carriedOver = carriedOverIds
    .map((id) => byId.get(id))
    .filter((i): i is ScheduleRow => !!i);

  const openNew = () => setDraft(emptyDraft(months[0] ?? ""));
  const openEdit = (row: ScheduleRow) =>
    setDraft({
      id: row.id,
      category: row.category,
      title: row.title,
      priority: row.priority,
      status: row.status,
      targetMonth: row.targetMonth ?? "",
      targetDate: row.targetDate ?? "",
      confirmed: row.confirmed,
      note: row.note,
      issueNumbers: row.links.map((l) => `#${l.issueNumber}`).join(" "),
    });

  return (
    <div className="space-y-4">
      {/* 今週進める分 — 開発MTGで最初に見るところ */}
      <Card className="p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{weekLabel}に進める分</h2>
          <Badge tone={thisWeek.length > 0 ? "primary" : "neutral"}>{thisWeek.length}件</Badge>
          <div className="ml-auto flex items-center gap-2">
            <CopyWeekButton items={thisWeek} week={week} />
            {editable && (
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4" />
                機能を追加
              </Button>
            )}
          </div>
        </div>

        {thisWeek.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            今週に予定している機能はありません。
          </p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {thisWeek.map((row) => (
              <WeekCard
                key={row.id}
                row={row}
                editable={editable}
                onEdit={() => openEdit(row)}
              />
            ))}
          </div>
        )}

        {carriedOver.length > 0 && (
          <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-xs font-medium text-muted-foreground">
              先週までの予定で、まだ終わっていないもの（{carriedOver.length}件）
            </p>
            <ul className="mt-1.5 space-y-1">
              {carriedOver.map((row) => (
                <li key={row.id} className="text-sm">
                  <span className="text-muted-foreground">{formatShortDate(row.targetDate)}</span>
                  <span className="ml-2">{row.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* 中長期の予定 — スプレッドシートと同じ「月を横に並べた」表 */}
      {items.length > 0 && (
        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">中長期の予定</h2>
            <span className="text-xs text-muted-foreground">
              ★ = 日程が確定 / ☆ = 未確定
            </span>
          </div>
          <Table mobile="scroll">
            <THead>
              <TR>
                {editable && <TH className="w-8" aria-label="並べ替え" />}
                <TH className="whitespace-nowrap">カテゴリ</TH>
                <TH className="min-w-[220px]">機能</TH>
                <TH className="whitespace-nowrap">優先度</TH>
                {months.map((m) => (
                  <TH key={m} className="whitespace-nowrap text-center">
                    {formatMonthKey(m, { short: true })}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {rows.map((row, index) => (
                <TimelineRow
                  key={row.id}
                  row={row}
                  months={months}
                  editable={editable}
                  thisWeek={thisWeekIds.includes(row.id)}
                  onEdit={() => openEdit(row)}
                  onMoveUp={index > 0 ? () => move(index, index - 1) : undefined}
                  onMoveDown={index < rows.length - 1 ? () => move(index, index + 1) : undefined}
                  reorderPending={pending}
                />
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {editable && <ViewerPanel members={members} />}

      <ScheduleItemDialog draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}

/** 今週進める1件。連動している依頼は畳んでおき、件数だけ見せる。 */
function WeekCard({
  row,
  editable,
  onEdit,
}: {
  row: ScheduleRow;
  editable: boolean;
  onEdit: () => void;
}) {
  const progress = scheduleProgress(row.links);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {row.category && <Badge tone="neutral">{row.category}</Badge>}
            <Badge tone={devScheduleStatusTone[row.status]}>
              {devScheduleStatusLabels[row.status]}
            </Badge>
            {row.targetDate && (
              <span className="text-xs font-medium text-muted-foreground">
                {row.confirmed && "★"}
                {formatShortDate(row.targetDate)}
              </span>
            )}
          </div>
          <p className="mt-1.5 font-medium leading-snug">{row.title}</p>
          <p className="mt-0.5 text-xs text-warning">
            {devSchedulePriorityStars(row.priority)}
          </p>
          {row.note && <p className="mt-1 text-xs text-muted-foreground">{row.note}</p>}
        </div>
        {editable && (
          <button
            onClick={onEdit}
            className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`${row.title} を編集`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {progress.total > 0 && (
        <>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <span className="tabular text-xs text-muted-foreground">
              {progress.done}/{progress.total}
            </span>
          </div>
          <LinkedIssues links={row.links} />
        </>
      )}
    </div>
  );
}

/**
 * 連動している依頼。既定は畳んでおく。
 * 開発MTGでは「機能いくつ」で話すため、依頼の一覧は必要なときだけ開く。
 */
function LinkedIssues({ links }: { links: DevScheduleLinkedIssue[] }) {
  const [open, setOpen] = React.useState(false);
  if (links.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        開発進捗 {links.length}件
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 border-l border-border pl-2.5">
          {links.map((l) => (
            <li key={l.issueId} className="flex flex-wrap items-center gap-1.5 text-xs">
              <Link
                href={`/dev/${l.issueId}`}
                className="font-medium text-primary hover:underline"
              >
                #{l.issueNumber}
              </Link>
              <span className="min-w-0 truncate text-muted-foreground">{l.title}</span>
              <DevIssueStatusBadge status={l.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 中長期の表の1行。該当する月のセルにだけ印を置く。 */
function TimelineRow({
  row,
  months,
  editable,
  thisWeek,
  onEdit,
  onMoveUp,
  onMoveDown,
  reorderPending,
}: {
  row: ScheduleRow;
  months: string[];
  editable: boolean;
  thisWeek: boolean;
  onEdit: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  reorderPending: boolean;
}) {
  const dropped = row.status === "dropped";
  const done = row.status === "done";
  const progress = scheduleProgress(row.links);
  // 当月より前の予定は先頭列にまとめて出す(過ぎた月の列は作らない)
  const cellMonth = row.month && months.includes(row.month) ? row.month : months[0] ?? null;

  return (
    <TR className={cn(thisWeek && "bg-primary/5", dropped && "opacity-60")}>
      {editable && (
        <TD className="px-1">
          <div className="flex flex-col text-muted-foreground">
            <button
              type="button"
              className="rounded p-0.5 hover:bg-muted hover:text-foreground disabled:opacity-30"
              disabled={reorderPending || !onMoveUp}
              onClick={onMoveUp}
              aria-label={`${row.title} を上へ`}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="rounded p-0.5 hover:bg-muted hover:text-foreground disabled:opacity-30"
              disabled={reorderPending || !onMoveDown}
              onClick={onMoveDown}
              aria-label={`${row.title} を下へ`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </TD>
      )}
      <TD className="whitespace-nowrap text-xs text-muted-foreground">{row.category || "—"}</TD>
      <TD primary>
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <span className={cn("font-medium", dropped && "line-through")}>{row.title}</span>
            {progress.total > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                開発進捗 {progress.done}/{progress.total}
              </span>
            )}
            {row.note && (
              <span className="mt-0.5 block text-xs text-muted-foreground">{row.note}</span>
            )}
          </div>
          {editable && (
            <button
              onClick={onEdit}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`${row.title} を編集`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </TD>
      <TD className="whitespace-nowrap text-xs text-warning">
        {devSchedulePriorityStars(row.priority)}
      </TD>
      {months.map((m) => (
        <TD key={m} className="whitespace-nowrap text-center text-sm">
          {m === cellMonth ? (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                done && "text-success",
                dropped && "text-muted-foreground line-through",
                !done && !dropped && !row.confirmed && "text-muted-foreground",
              )}
            >
              {done ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <span aria-hidden>{row.confirmed ? "★" : "☆"}</span>
              )}
              {formatShortDate(row.targetDate)}
            </span>
          ) : (
            <span className="text-muted-foreground/30">·</span>
          )}
        </TD>
      ))}
    </TR>
  );
}

/** 今週分を開発MTG用の文面にしてコピーする */
function CopyWeekButton({ items, week }: { items: ScheduleRow[]; week: WeekRange }) {
  const [copied, setCopied] = React.useState(false);
  if (items.length === 0) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await copyText(weekShareText(items, week));
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "コピーしました" : "今週分をコピー"}
    </Button>
  );
}
