"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { devIssueCategoryLabels, devIssueStatusLabels } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

/** 既定(value: "")は未完了のみ。完了した依頼は残るが、開いた直後には表示しない。 */
const statusTabs: { value: string; label: string }[] = [
  { value: "", label: "未完了" },
  { value: "open", label: devIssueStatusLabels.open },
  { value: "in_progress", label: devIssueStatusLabels.in_progress },
  { value: "hearing", label: devIssueStatusLabels.hearing },
  { value: "done", label: devIssueStatusLabels.done },
  { value: "all", label: "すべて" },
];

const categoryTabs: { value: string; label: string }[] = [
  { value: "all", label: "分類: すべて" },
  { value: "bug", label: devIssueCategoryLabels.bug },
  { value: "request", label: devIssueCategoryLabels.request },
];

export function IssueFilters({
  status,
  category,
  query,
}: {
  status: string;
  category: string;
  query: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(query);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    // status は "" が既定(未完了のみ)。他のキーは "all" が既定。
    const isDefault = key === "status" ? value === "" : !value || value === "all";
    if (isDefault) next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (q !== query) setParam("q", q);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const pill = (active: boolean) =>
    cn(
      // 指で押せる高さ(36px)を確保し、スマホでは横スクロールで並べる
      "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground hover:text-foreground active:bg-muted/70",
    );

  return (
    <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
      {/* スマホでは検索を最上段に置く(いちばん使う操作) */}
      <div className="relative order-first lg:order-last lg:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          enterKeyHint="search"
          placeholder="課題名・詳細・依頼者で検索"
          aria-label="開発依頼を検索"
          className="h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
        />
      </div>

      {/* 状態・分類は横スクロールのレール(折り返して縦に伸びないようにする) */}
      <div className="-mx-1 flex flex-col gap-1.5 lg:mx-0 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="snap-rail gap-1.5 px-1 lg:flex-wrap">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setParam("status", tab.value)}
              aria-pressed={status === tab.value}
              className={pill(status === tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span className="mx-1 hidden h-4 w-px bg-border lg:block" />
        <div className="snap-rail gap-1.5 px-1 lg:flex-wrap">
          {categoryTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setParam("category", tab.value)}
              aria-pressed={(category || "all") === tab.value}
              className={pill((category || "all") === tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
