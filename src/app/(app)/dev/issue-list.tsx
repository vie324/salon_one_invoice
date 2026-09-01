"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  GripVertical,
  MessageSquare,
  Share2,
  SquareCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { reorderDevIssuesAction } from "@/app/actions/dev-issues";
import { ShareButton } from "@/components/share/share-sheet";
import {
  DevIssueCategoryBadge,
  DevIssueExecutionBadge,
  DevIssuePriorityBadge,
  DevIssueStatusBadge,
} from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  devIssueShareSummary,
  STALE_DAYS,
  type DevIssueUrgency,
} from "@/lib/domain/dev-issues";
import type {
  DevIssueCategory,
  DevIssueExecution,
  DevIssuePriority,
  DevIssueStatus,
} from "@/lib/domain/types";
import { copyText, devIssueShortPath, nativeShare, toAbsoluteUrl } from "@/lib/share";
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
  completedDate: string | null;
  urgency: DevIssueUrgency;
}

/** 督促バッジ(表・カードで共通) */
function UrgencyBadges({ u }: { u: DevIssueUrgency }) {
  return (
    <>
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
    </>
  );
}

/**
 * 開発依頼の一覧。
 *
 * - PC: 従来どおりの表。manual=true では行をドラッグ（または上下ボタン）で入れ替え。
 * - スマホ: 1件=1カードに積み替え、横スクロールせずに読める形にする。
 * - 「選択して共有」: 急ぎでお願いしたい依頼を複数選び、番号つきの短縮URL
 *   （/d/12 形式）を1通のメッセージにまとめて LINE などへ送れる。
 */
export function IssueList({ rows, manual }: { rows: DevIssueRow[]; manual: boolean }) {
  const router = useRouter();
  const [order, setOrder] = React.useState(rows);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  // --- まとめて共有 ---
  const [selectMode, setSelectMode] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [shareDone, setShareDone] = React.useState<string | null>(null);

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

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /** 選択した依頼を「番号 + 短縮URL」の一覧にして共有する */
  const buildShareText = () => {
    const picked = order.filter((r) => selected.includes(r.id));
    const lines = picked.map(
      (r, i) => `${i + 1}. ${devIssueShareSummary(r)}\n   ${toAbsoluteUrl(devIssueShortPath(r.issueNumber))}`,
    );
    return `【対応をお願いしたい項目 ${picked.length}件】\n${lines.join("\n")}`;
  };

  const shareSelected = async () => {
    if (selected.length === 0) return;
    const text = buildShareText();
    const shared = await nativeShare({ title: "対応をお願いしたい項目", text });
    if (shared) {
      setShareDone("共有しました");
    } else {
      await copyText(text);
      setShareDone("メッセージをコピーしました。貼り付けて送信してください");
    }
    window.setTimeout(() => setShareDone(null), 3200);
  };

  const allSelected = order.length > 0 && selected.length === order.length;

  return (
    <div className="space-y-2">
      {/* 共有ツールバー */}
      <div className="flex flex-wrap items-center gap-2">
        {!selectMode ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectMode(true);
              setSelected([]);
            }}
          >
            <Share2 className="h-4 w-4" />
            選択して共有
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" onClick={() => void shareSelected()} disabled={selected.length === 0}>
              <Share2 className="h-4 w-4" />
              {selected.length > 0 ? `${selected.length}件を共有` : "共有する項目を選択"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyText(buildShareText())}
              disabled={selected.length === 0}
            >
              <Copy className="h-4 w-4" />
              コピー
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(allSelected ? [] : order.map((r) => r.id))}
            >
              <SquareCheck className="h-4 w-4" />
              {allSelected ? "選択を解除" : "表示中をすべて"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectMode(false);
                setSelected([]);
              }}
            >
              <X className="h-4 w-4" />
              やめる
            </Button>
          </>
        )}
      </div>
      {selectMode && !shareDone && (
        <p className="text-xs text-muted-foreground">
          急ぎでお願いしたい依頼をタップして選ぶと、短いURL（例:{" "}
          <span className="tabular">/d/12</span>）つきの一覧を1通で送れます。
        </p>
      )}
      {shareDone && (
        <p className="inline-flex items-center gap-1 text-xs text-success">
          <Check className="h-3.5 w-3.5" />
          {shareDone}
        </p>
      )}

      {manual && (
        <p className="hidden text-xs text-muted-foreground md:block">
          行の左端（
          <GripVertical className="inline h-3.5 w-3.5 align-text-bottom" />
          ）をつかんで上下にドラッグすると、対応の順番を入れ替えられます。矢印ボタンでも動かせます。
        </p>
      )}
      {manual && (
        <p className="text-xs text-muted-foreground md:hidden">
          各カードの
          <ChevronUp className="inline h-3.5 w-3.5 align-text-bottom" />
          <ChevronDown className="inline h-3.5 w-3.5 align-text-bottom" />
          で対応の順番を入れ替えられます。
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && !error && <p className="text-xs text-success">{notice}</p>}

      {/* --- スマホ: 1件 = 1カード --- */}
      <ul className="space-y-2.5 md:hidden">
        {order.map((row, index) => (
          <IssueCard
            key={row.id}
            row={row}
            index={index}
            total={order.length}
            manual={manual}
            pending={pending}
            onMove={move}
            selectMode={selectMode}
            checked={selected.includes(row.id)}
            onToggle={() => toggleSelect(row.id)}
          />
        ))}
      </ul>

      {/* --- PC: 一覧表 --- */}
      <div className="hidden md:block">
        <Table mobile="scroll">
          <THead>
            <TR className="hover:bg-transparent">
              {selectMode && <TH className="w-10">選択</TH>}
              {manual && <TH className="w-16">順番</TH>}
              <TH className="w-14">No</TH>
              <TH className="whitespace-nowrap">記載日</TH>
              <TH>分類</TH>
              <TH>優先度</TH>
              <TH className="whitespace-nowrap">ステータス</TH>
              <TH className="whitespace-nowrap">実行有無</TH>
              <TH className="min-w-[240px]">課題名 / 依頼者</TH>
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
                  {selectMode && (
                    <TD>
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                        checked={selected.includes(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`#${row.issueNumber} を共有対象にする`}
                      />
                    </TD>
                  )}
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
                      <UrgencyBadges u={u} />
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{formatDate(row.completedDate)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

/** スマホ用の1件カード。表の全項目を縦に積み、指で押せる大きさにする。 */
function IssueCard({
  row,
  index,
  total,
  manual,
  pending,
  onMove,
  selectMode,
  checked,
  onToggle,
}: {
  row: DevIssueRow;
  index: number;
  total: number;
  manual: boolean;
  pending: boolean;
  onMove: (from: number, to: number) => void;
  selectMode: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const u = row.urgency;

  const head = (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="tabular text-[11px] font-medium text-muted-foreground">
          #{row.issueNumber}
        </span>
        <DevIssueCategoryBadge category={row.category} />
        <DevIssuePriorityBadge priority={row.priority} />
        <span className="ml-auto">
          <DevIssueStatusBadge status={row.status} />
        </span>
      </div>
      <div className="mt-1.5 text-[15px] font-semibold leading-snug">{row.title}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
        <span>{row.requesterName}</span>
        <span className="tabular">記載 {formatDate(row.createdAt)}</span>
        {u.open && u.days >= STALE_DAYS && (
          <span
            className={cn(
              "tabular font-medium",
              row.category === "bug" ? "text-destructive" : "text-warning",
            )}
          >
            {u.days}日経過
          </span>
        )}
        {row.category === "request" && (
          <DevIssueExecutionBadge execution={row.execution} muted={false} />
        )}
      </div>
      {(u.hearingAnswered || u.hearingAwaitingReply || u.pendingApprovers.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <UrgencyBadges u={u} />
        </div>
      )}
      {row.completedDate && (
        <dl className="mt-2.5 rounded-md bg-muted/50 px-2.5 py-2 text-[11px]">
          <div>
            <dt className="text-muted-foreground">完了日</dt>
            <dd className="tabular mt-0.5 font-medium">{formatDate(row.completedDate)}</dd>
          </div>
        </dl>
      )}
    </>
  );

  return (
    <li
      className={cn(
        "overflow-hidden rounded-lg border bg-card shadow-sm transition-colors",
        u.urgent ? "border-destructive/40" : "border-border",
        selectMode && checked && "ring-2 ring-primary",
      )}
    >
      {selectMode ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={checked}
          className="block w-full p-3 text-left active:bg-muted/50"
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-medium">
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded border",
                checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
              )}
              aria-hidden
            >
              {checked && <Check className="h-3.5 w-3.5" />}
            </span>
            {checked ? "共有に含める" : "タップで選択"}
          </div>
          {head}
        </button>
      ) : (
        <Link href={`/dev/${row.id}`} className="block p-3 active:bg-muted/50">
          {head}
        </Link>
      )}

      {!selectMode && (
        <div className="flex items-center gap-1 border-t border-border bg-muted/20 px-2 py-1.5">
          <ShareButton
            target={{
              url: devIssueShortPath(row.issueNumber),
              title: `#${row.issueNumber} ${row.title}`,
              text: devIssueShareSummary(row),
            }}
            label="共有"
          />
          {manual && (
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="tap-target inline-flex items-center justify-center rounded-md text-muted-foreground active:bg-muted disabled:opacity-30"
                disabled={pending || index === 0}
                onClick={() => onMove(index, index - 1)}
                aria-label={`#${row.issueNumber} を上へ`}
              >
                <ChevronUp className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="tap-target inline-flex items-center justify-center rounded-md text-muted-foreground active:bg-muted disabled:opacity-30"
                disabled={pending || index === total - 1}
                onClick={() => onMove(index, index + 1)}
                aria-label={`#${row.issueNumber} を下へ`}
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>
          )}
          {!manual && (
            <Link
              href={`/dev/${row.id}`}
              className="tap-target ml-auto inline-flex items-center gap-1 rounded-md px-2 text-xs font-medium text-primary active:bg-muted"
            >
              詳細
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
