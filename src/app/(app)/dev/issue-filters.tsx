"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { devIssueCategoryLabels, devIssueStatusLabels } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

const statusTabs: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "open", label: devIssueStatusLabels.open },
  { value: "in_progress", label: devIssueStatusLabels.in_progress },
  { value: "hearing", label: devIssueStatusLabels.hearing },
  { value: "done", label: devIssueStatusLabels.done },
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
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
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
      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setParam("status", tab.value)}
            className={pill((status || "all") === tab.value)}
          >
            {tab.label}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        {categoryTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setParam("category", tab.value)}
            className={pill((category || "all") === tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="relative lg:w-64">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="課題名・詳細・依頼者で検索"
          className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}
