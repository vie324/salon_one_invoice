"use client";

import {
  CalendarRange,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
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
import type { PickerIssue } from "./issue-picker";

/**
 * 左に貼り付ける「カテゴリ」列の幅(px)。
 * 2列目(機能)の left もこの値から導くので、ここだけ変えれば揃う。
 */
const CATEGORY_COL_W = 96;

/** 表示用の行(サーバーで月を確定させたもの) */
export type ScheduleRow = DevScheduleItem & { month: string | null };

/**
 * カテゴリごとの色。スプレッドシートの見た目に近づけつつ、
 * どの領域の機能かを色で一目で追えるようにする(未知のカテゴリは中立色)。
 */
const CATEGORY_TONE: Record<string, string> = {
  基盤: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  分析: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  人事: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  CRM: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  外部連携: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  会計: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  AI: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  契約: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  本部: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
};

function CategoryChip({ category }: { category: string }) {
  if (!category) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        // 長いカテゴリ名でも列幅を押し広げないよう省略表示にする
        "inline-block max-w-full truncate rounded px-2 py-0.5 text-xs font-semibold",
        CATEGORY_TONE[category] ?? "bg-muted text-muted-foreground",
      )}
      title={category}
    >
      {category}
    </span>
  );
}

/** 優先度。★を色付きで出し、数字も添えて一目で比べられるようにする。 */
function PriorityStars({ priority }: { priority: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="text-sm tracking-tight text-warning">
        {devSchedulePriorityStars(priority)}
      </span>
      <span className="tabular text-[11px] text-muted-foreground">{priority}</span>
    </span>
  );
}

export function ScheduleBoard({
  editable,
  week,
  weekLabel,
  currentMonth,
  months,
  items,
  thisWeekIds,
  carriedOverIds,
  issues,
}: {
  editable: boolean;
  week: WeekRange;
  weekLabel: string;
  /** 当月(YYYY-MM)。列の強調に使う。 */
  currentMonth: string;
  months: string[];
  items: ScheduleRow[];
  thisWeekIds: string[];
  carriedOverIds: string[];
  issues: PickerIssue[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<ScheduleItemDraft | null>(null);
  // 並べ替えは押した直後に画面へ反映し、保存はその後ろで行う
  const [order, setOrder] = React.useState<string[]>(items.map((i) => i.id));
  const [pending, startTransition] = React.useTransition();
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    setOrder(items.map((i) => i.id));
  }, [items]);

  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = order.map((id) => byId.get(id)).filter((i): i is ScheduleRow => !!i);
  const thisWeek = thisWeekIds.map((id) => byId.get(id)).filter((i): i is ScheduleRow => !!i);
  const carriedOver = carriedOverIds
    .map((id) => byId.get(id))
    .filter((i): i is ScheduleRow => !!i);

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

  const openNew = () => setDraft(emptyDraft(currentMonth));
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
      issueIds: row.links.map((l) => l.issueId),
    });

  return (
    <div className="space-y-4">
      {/* 今週進める分 — 開発MTGで最初に見るところ */}
      <Card className="border-primary/30 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CalendarRange className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold">{weekLabel}に進める分</h2>
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
              <WeekCard key={row.id} row={row} editable={editable} onEdit={() => openEdit(row)} />
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
                <li key={row.id} className="flex items-center gap-2 text-sm">
                  <span className="tabular text-xs text-muted-foreground">
                    {formatShortDate(row.targetDate)}
                  </span>
                  <CategoryChip category={row.category} />
                  <span>{row.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* 中長期の予定 — スプレッドシートと同じ「月を横に並べた」表 */}
      {items.length > 0 && (
        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="text-base font-bold">中長期の予定</h2>
            <span className="inline-flex items-center gap-2.5 text-xs text-muted-foreground">
              <span>
                <span className="font-semibold text-warning">★</span> 日程が確定
              </span>
              <span>
                <span className="font-semibold">☆</span> 未確定
              </span>
              <span className="inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-success" /> 完了
              </span>
            </span>
            {editable && (
              <span className="text-xs text-muted-foreground">
                行をつかんで上下にドラッグすると順番を変えられます
              </span>
            )}
          </div>

          {/* 横スクロールする表。左の「カテゴリ / 機能」は貼り付けて常に見えるようにする */}
          <div className="-mx-3 overflow-x-auto scrollbar-thin sm:mx-0">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  {editable && <th className="w-9 border-b border-border bg-card px-1 pb-2" />}
                  <th
                    style={{ width: CATEGORY_COL_W, minWidth: CATEGORY_COL_W }}
                    className="sticky left-0 z-20 border-b border-border bg-card px-3 pb-2 text-left font-medium"
                  >
                    カテゴリ
                  </th>
                  <th
                    style={{ left: CATEGORY_COL_W }}
                    className="sticky z-20 min-w-[220px] border-b border-r border-border bg-card px-3 pb-2 text-left font-medium"
                  >
                    機能
                  </th>
                  <th className="w-28 whitespace-nowrap border-b border-border px-3 pb-2 text-left font-medium">
                    優先度
                  </th>
                  {months.map((m) => (
                    <th
                      key={m}
                      className={cn(
                        "w-24 whitespace-nowrap border-b border-border px-2 pb-2 text-center font-medium",
                        m === currentMonth && "bg-primary/10 text-primary",
                      )}
                    >
                      {formatMonthKey(m, { short: true })}
                      {m === currentMonth && (
                        <span className="ml-1 text-[10px] font-bold">今月</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <TimelineRow
                    key={row.id}
                    row={row}
                    months={months}
                    currentMonth={currentMonth}
                    editable={editable}
                    thisWeek={thisWeekIds.includes(row.id)}
                    striped={index % 2 === 1}
                    dragging={dragIndex === index}
                    dropTarget={overIndex === index && dragIndex !== index}
                    onEdit={() => openEdit(row)}
                    onMoveUp={index > 0 ? () => move(index, index - 1) : undefined}
                    onMoveDown={index < rows.length - 1 ? () => move(index, index + 1) : undefined}
                    reorderPending={pending}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => {
                      if (!editable || dragIndex === null) return;
                      e.preventDefault();
                      setOverIndex(index);
                    }}
                    onDrop={(e) => {
                      if (!editable || dragIndex === null) return;
                      e.preventDefault();
                      move(dragIndex, index);
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setOverIndex(null);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ScheduleItemDialog draft={draft} issues={issues} onClose={() => setDraft(null)} />
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
    <div className="rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryChip category={row.category} />
            <Badge tone={devScheduleStatusTone[row.status]}>
              {devScheduleStatusLabels[row.status]}
            </Badge>
            {row.targetDate && (
              <span
                className={cn(
                  "tabular inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold",
                  row.confirmed
                    ? "bg-warning/15 text-[hsl(38_92%_32%)] dark:text-warning"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {row.confirmed ? "★" : "☆"}
                {formatShortDate(row.targetDate)}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-base font-semibold leading-snug">{row.title}</p>
          <div className="mt-1">
            <PriorityStars priority={row.priority} />
          </div>
          {row.note && <p className="mt-1 text-xs text-muted-foreground">{row.note}</p>}
        </div>
        {editable && (
          <button
            onClick={onEdit}
            className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`${row.title} を編集`}
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {progress.total > 0 && (
        <>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <span className="tabular text-xs font-medium text-muted-foreground">
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
        <ul className="mt-1.5 space-y-1 border-l-2 border-border pl-2.5">
          {links.map((l) => (
            <li key={l.issueId} className="flex flex-wrap items-center gap-1.5 text-xs">
              <Link
                href={`/dev/${l.issueId}`}
                className="tabular font-semibold text-primary hover:underline"
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
  currentMonth,
  editable,
  thisWeek,
  striped,
  dragging,
  dropTarget,
  onEdit,
  onMoveUp,
  onMoveDown,
  reorderPending,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  row: ScheduleRow;
  months: string[];
  currentMonth: string;
  editable: boolean;
  thisWeek: boolean;
  striped: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onEdit: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  reorderPending: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const dropped = row.status === "dropped";
  const done = row.status === "done";
  const progress = scheduleProgress(row.links);
  // 当月より前の予定は先頭列にまとめて出す(過ぎた月の列は作らない)
  const cellMonth = row.month && months.includes(row.month) ? row.month : months[0] ?? null;

  // 貼り付けたセルは背景が透けると下の行が見えるため、行の背景色を明示する
  const rowBg = thisWeek ? "bg-primary/10" : striped ? "bg-muted/30" : "bg-card";
  const cell = cn("border-b border-border px-3 py-2.5 align-middle", rowBg);

  return (
    <tr
      draggable={editable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "group transition-colors",
        editable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
        dropped && "opacity-60",
      )}
    >
      {editable && (
        <td className={cn(cell, "px-1", dropTarget && "border-t-2 border-t-primary")}>
          <div className="flex items-center text-muted-foreground">
            <GripVertical className="h-4 w-4 shrink-0 opacity-40 group-hover:opacity-100" aria-hidden />
            <div className="flex flex-col">
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
          </div>
        </td>
      )}
      <td
        style={{ width: CATEGORY_COL_W, minWidth: CATEGORY_COL_W }}
        className={cn(cell, "sticky left-0 z-10", dropTarget && "border-t-2 border-t-primary")}
      >
        <CategoryChip category={row.category} />
      </td>
      <td
        style={{ left: CATEGORY_COL_W }}
        className={cn(cell, "sticky z-10 border-r", dropTarget && "border-t-2 border-t-primary")}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <span className={cn("font-semibold", dropped && "line-through")}>{row.title}</span>
            {progress.total > 0 && (
              <span className="ml-2 whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
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
              className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`${row.title} を編集`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
      <td className={cn(cell, dropTarget && "border-t-2 border-t-primary")}>
        <PriorityStars priority={row.priority} />
      </td>
      {months.map((m) => (
        <td
          key={m}
          className={cn(
            cell,
            "px-2 text-center",
            m === currentMonth && !thisWeek && "bg-primary/5",
            dropTarget && "border-t-2 border-t-primary",
          )}
        >
          {m === cellMonth ? (
            <span
              className={cn(
                "tabular inline-flex items-center gap-0.5 whitespace-nowrap rounded px-2 py-1 text-xs font-bold",
                done && "bg-success/15 text-success",
                dropped && "bg-muted text-muted-foreground line-through",
                !done && !dropped && row.confirmed && "bg-warning/20 text-[hsl(38_92%_30%)] dark:text-warning",
                !done && !dropped && !row.confirmed && "border border-dashed border-border text-muted-foreground",
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
            <span className="text-border" aria-hidden>
              ·
            </span>
          )}
        </td>
      ))}
    </tr>
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
