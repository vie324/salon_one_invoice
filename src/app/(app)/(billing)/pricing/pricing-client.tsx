"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { SubscriptionStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { hasCustomPrice, type ClientPriceRow } from "@/lib/domain/client-pricing";
import { cn, formatJPY } from "@/lib/utils";

type PriceFilter = "all" | "custom" | "list";
type SortKey = "monthly_desc" | "monthly_asc" | "code" | "name";

const priceTabs: { value: PriceFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "custom", label: "個別価格のお客様" },
  { value: "list", label: "定価どおり" },
];

const sortLabels: Record<SortKey, string> = {
  monthly_desc: "月額が高い順",
  monthly_asc: "月額が安い順",
  code: "顧客コード順",
  name: "顧客名順",
};

const compareRows: Record<SortKey, (a: ClientPriceRow, b: ClientPriceRow) => number> = {
  monthly_desc: (a, b) => b.monthly - a.monthly || a.customerCode.localeCompare(b.customerCode),
  monthly_asc: (a, b) => a.monthly - b.monthly || a.customerCode.localeCompare(b.customerCode),
  code: (a, b) => a.customerCode.localeCompare(b.customerCode),
  name: (a, b) => (a.customerKana || a.customerName).localeCompare(b.customerKana || b.customerName, "ja"),
};

export function PricingClient({ rows }: { rows: ClientPriceRow[] }) {
  const [query, setQuery] = React.useState("");
  const [priceFilter, setPriceFilter] = React.useState<PriceFilter>("all");
  const [sort, setSort] = React.useState<SortKey>("monthly_desc");
  const [showCanceled, setShowCanceled] = React.useState(false);
  // 料金パターン(月額・税抜)で絞り込む。null = 絞り込まない
  const [amount, setAmount] = React.useState<number | null>(null);

  const inScope = React.useMemo(
    () => rows.filter((r) => showCanceled || r.status !== "canceled"),
    [rows, showCanceled],
  );

  // 同じ月額のお客様が何社いるか。金額の種類と人数がひと目で分かるようにする
  const patterns = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of inScope) counts.set(r.monthly, (counts.get(r.monthly) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[0] - a[0]);
  }, [inScope]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope
      .filter((r) => {
        if (priceFilter === "custom" && !hasCustomPrice(r)) return false;
        if (priceFilter === "list" && hasCustomPrice(r)) return false;
        if (amount != null && r.monthly !== amount) return false;
        if (!q) return true;
        return [r.customerName, r.customerKana, r.customerCode, r.planName, r.customerNotes].some((v) =>
          v.toLowerCase().includes(q),
        );
      })
      .sort(compareRows[sort]);
  }, [inScope, query, priceFilter, amount, sort]);

  const customCount = inScope.filter(hasCustomPrice).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="snap-rail -mx-1 gap-1.5 px-1 lg:mx-0 lg:flex-wrap">
          {priceTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setPriceFilter(tab.value)}
              aria-pressed={priceFilter === tab.value}
              className={cn(
                "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors",
                priceFilter === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground active:bg-muted/70",
              )}
            >
              {tab.label}
              {tab.value === "custom" && <span className="tabular ml-1.5 opacity-80">{customCount}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showCanceled}
              onChange={(e) => setShowCanceled(e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            解約済みも表示
          </label>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="並び順"
            className="md:h-9 sm:w-40"
          >
            {(Object.keys(sortLabels) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {sortLabels[k]}
              </option>
            ))}
          </Select>
          <div className="relative sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              enterKeyHint="search"
              placeholder="顧客名・コードで検索"
              aria-label="顧客を検索"
              className="h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
            />
          </div>
        </div>
      </div>

      {patterns.length > 1 && (
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            料金パターン（月額・税抜）— 押すとその金額のお客様だけを表示
          </div>
          <div className="flex flex-wrap gap-1.5">
            {patterns.map(([value, count]) => {
              const active = amount === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(active ? null : value)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-foreground hover:bg-muted",
                  )}
                >
                  <span className="tabular font-semibold">{formatJPY(value)}</span>
                  <span className="text-muted-foreground">{count}社</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>顧客</TH>
            <TH>プラン</TH>
            <TH>内訳（税抜・1店舗あたり）</TH>
            <TH className="text-right">月額（税抜／税込）</TH>
            <TH className="text-right">定価との差</TH>
            <TH className="text-right">初期費用（税抜）</TH>
            <TH>状態</TH>
          </TR>
        </THead>
        <TBody>
          {visible.length === 0 && (
            <TR className="hover:bg-transparent">
              <TD colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                条件に合うお客様はいません
              </TD>
            </TR>
          )}
          {visible.map((r) => (
            <TR
              key={r.subscriptionId}
              className={cn(
                hasCustomPrice(r) && "bg-warning/[0.06]",
                r.status === "canceled" && "opacity-60",
              )}
            >
              <TD primary>
                <Link href={`/customers/${r.customerId}`} className="font-medium hover:text-primary hover:underline">
                  {r.customerName}
                </Link>
                <div className="tabular text-xs text-muted-foreground">{r.customerCode}</div>
                {r.customerNotes && (
                  <div className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground" title={r.customerNotes}>
                    {r.customerNotes}
                  </div>
                )}
              </TD>
              <TD className="text-muted-foreground">{r.planName}</TD>
              <TD>
                <div className="space-y-0.5 text-xs">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span className="text-muted-foreground">基本</span>
                    <span className={cn("tabular", r.priceOverridden && "font-semibold text-foreground")}>
                      {formatJPY(r.basePerStore)}
                    </span>
                    {r.priceOverridden && (
                      <>
                        <span className="tabular text-muted-foreground line-through">
                          {formatJPY(r.listBasePerStore)}
                        </span>
                        <Badge tone="warning" className="px-2 py-0 text-[11px]">
                          個別価格
                        </Badge>
                      </>
                    )}
                  </div>
                  {r.options.map((o) => (
                    <div key={o.key} className="text-muted-foreground">
                      ＋{o.name} <span className="tabular">{formatJPY(o.monthly)}</span>
                    </div>
                  ))}
                  {r.storeCount > 1 && (
                    <div className="font-medium text-foreground">× {r.storeCount}店舗</div>
                  )}
                </div>
              </TD>
              <TD className="text-right">
                <div className="tabular text-base font-bold">{formatJPY(r.monthly)}</div>
                <div className="tabular text-xs text-muted-foreground">税込 {formatJPY(r.monthlyWithTax)}</div>
              </TD>
              <TD className="text-right">
                {r.monthlyDiff === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <div>
                    <div
                      className={cn(
                        "tabular font-semibold",
                        r.monthlyDiff < 0 ? "text-[hsl(38_92%_32%)] dark:text-warning" : "text-info",
                      )}
                    >
                      {formatJPY(r.monthlyDiff, { sign: true })}
                    </div>
                    <div className="tabular text-xs text-muted-foreground">定価 {formatJPY(r.listMonthly)}</div>
                  </div>
                )}
              </TD>
              <TD className="text-right">
                {r.initialFee == null ? (
                  <span className="text-xs text-muted-foreground" title="このシステムに初回請求書・契約書の記録がありません">
                    —
                  </span>
                ) : (
                  <div>
                    <div className={cn("tabular", r.initialFeeOverridden && "font-semibold")}>
                      {formatJPY(r.initialFee)}
                    </div>
                    {r.initialFeeOverridden && (
                      <div className="tabular text-xs text-muted-foreground">
                        定価 <span className="line-through">{formatJPY(r.listInitialFee)}</span>
                      </div>
                    )}
                  </div>
                )}
              </TD>
              <TD>
                <SubscriptionStatusBadge status={r.status} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <p className="text-xs text-muted-foreground">
        {visible.length}件を表示。月額は毎月の請求書と同じ計算（（基本料金＋オプション）× 店舗数）です。紹介特典の無料期間中も、無料期間が終わった後の月額を表示します。
      </p>
    </div>
  );
}
