"use client";

import { Search, X } from "lucide-react";
import * as React from "react";
import { DevIssueCategoryBadge, DevIssueStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { DevIssueCategory, DevIssuePriority, DevIssueStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** 選択肢として出す開発進捗の1件 */
export interface PickerIssue {
  id: string;
  issueNumber: number;
  title: string;
  category: DevIssueCategory;
  priority: DevIssuePriority;
  status: DevIssueStatus;
  /** 未完了か(完了・実行なしを除く)。既定ではこれだけを出す。 */
  open: boolean;
}

type Filter = "all" | DevIssueCategory;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "bug", label: "不具合" },
  { value: "request", label: "要望" },
];

/**
 * 連動させる開発進捗を、いま挙がっている依頼から直接選ぶ。
 * 依頼番号を打ち込む必要はなく、分類（不具合・要望）で絞って選べる。
 */
export function IssuePicker({
  issues,
  selected,
  onChange,
}: {
  issues: PickerIssue[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [showDone, setShowDone] = React.useState(false);

  const byId = React.useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);
  const chosen = selected.map((id) => byId.get(id)).filter((i): i is PickerIssue => !!i);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  // 絞り込みは選択済みかどうかに関わらず同じように効かせる。
  // (選んだものは上のチップにすべて出ているので、一覧に残さなくても見失わない)
  const q = query.trim().toLowerCase();
  const visible = issues.filter((i) => {
    if (!showDone && !i.open) return false;
    if (filter !== "all" && i.category !== filter) return false;
    if (!q) return true;
    return i.title.toLowerCase().includes(q) || String(i.issueNumber).includes(q);
  });

  const doneHidden = issues.filter((i) => !i.open && !selected.includes(i.id)).length;

  return (
    <div className="space-y-2">
      {/* いま選んでいるもの（スクロールしなくても分かるように上に出す） */}
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-muted/40 p-2">
          {chosen.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => toggle(i.id)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              aria-label={`#${i.issueNumber} ${i.title} の連動を外す`}
            >
              #{i.issueNumber} {i.title}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
        <Badge tone="neutral" className="ml-auto">
          {selected.length}件を連動
        </Badge>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="課題名や番号で絞り込む"
          className="pl-9"
        />
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto scrollbar-thin rounded-md border border-border p-1.5">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            該当する依頼がありません。
          </p>
        ) : (
          visible.map((i) => (
            <label
              key={i.id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md p-2 text-sm transition-colors hover:bg-muted/60",
                selected.includes(i.id) && "bg-primary/5",
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                checked={selected.includes(i.id)}
                onChange={() => toggle(i.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium tabular">#{i.issueNumber}</span>
                  <DevIssueCategoryBadge category={i.category} />
                  <DevIssueStatusBadge status={i.status} />
                </span>
                <span className="mt-0.5 block break-words">{i.title}</span>
              </span>
            </label>
          ))
        )}
      </div>

      {doneHidden > 0 && (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[var(--color-primary)]"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          完了・実行なしの依頼も選べるようにする（{doneHidden}件）
        </label>
      )}
    </div>
  );
}
