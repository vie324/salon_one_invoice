"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { invoiceStatusLabels } from "@/lib/domain/constants";
import type { InvoiceStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const statusTabs: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "draft", label: invoiceStatusLabels.draft },
  { value: "awaiting_payment", label: invoiceStatusLabels.awaiting_payment },
  { value: "sent", label: invoiceStatusLabels.sent },
  { value: "overdue", label: invoiceStatusLabels.overdue },
  { value: "failed", label: invoiceStatusLabels.failed },
  { value: "paid", label: invoiceStatusLabels.paid },
];

export function InvoiceFilters({
  status,
  query,
}: {
  status: string;
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

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1.5">
        {statusTabs.map((tab) => {
          const active = (status || "all") === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setParam("status", tab.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="relative sm:w-64">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="請求書番号・顧客名で検索"
          className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}

export type { InvoiceStatus };
