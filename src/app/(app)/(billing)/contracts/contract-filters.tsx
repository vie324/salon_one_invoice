"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { contractStatusLabels } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

const statusTabs: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "draft", label: contractStatusLabels.draft },
  { value: "sent", label: contractStatusLabels.sent },
  { value: "viewed", label: contractStatusLabels.viewed },
  { value: "signed", label: contractStatusLabels.signed },
  { value: "expired", label: contractStatusLabels.expired },
  { value: "declined", label: contractStatusLabels.declined },
  { value: "canceled", label: contractStatusLabels.canceled },
];

export function ContractFilters({ status, query }: { status: string; query: string }) {
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

  return (
    <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
      <div className="snap-rail -mx-1 order-last gap-1.5 px-1 lg:order-first lg:mx-0 lg:flex-wrap">
        {statusTabs.map((tab) => {
          const active = (status || "all") === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setParam("status", tab.value)}
              type="button"
              aria-pressed={active}
              className={cn(
                // 指で押せる高さを確保。スマホでは折り返さず横スクロールで並べる
                "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground active:bg-muted/70",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="relative lg:w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          enterKeyHint="search"
          placeholder="契約書番号・顧客名で検索"
          aria-label="契約書を検索"
          className="h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
        />
      </div>
    </div>
  );
}
