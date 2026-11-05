"use client";

import {
  ChevronDown,
  ClipboardList,
  Coins,
  FileSignature,
  Megaphone,
  Repeat,
  Search,
  SquareKanban,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { MarketingServiceButton } from "@/components/marketing/marketing-service-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { priceGroupsTotal } from "@/lib/domain/calculations";
import { formatFeeRate, marketingBreakEvenAdSpend, marketingStatusLabels } from "@/lib/domain/marketing";
import { describePriceGroups, flatPriceGroups } from "@/lib/domain/pricing";
import type { StorePriceGroup } from "@/lib/domain/types";
import type { SignupRow } from "@/lib/orders/signups";
import { cn, formatDate, formatJPY, formatMonthKey } from "@/lib/utils";

export type SignupProductFilter = "all" | "system" | "marketing";
/** "all" / 年 (YYYY) / 月 (YYYY-MM) */
export type SignupPeriod = string;

const productTabs: { value: SignupProductFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "system", label: "SalonOne" },
  { value: "marketing", label: "マーケティング代行" },
];

/** PC の列幅(見出しと行で同じものを使う) */
const COLS =
  "md:grid md:grid-cols-[5.5rem_minmax(0,1.1fr)_minmax(0,1.5fr)_7.5rem_9rem_7.5rem_1.75rem] md:items-center md:gap-x-4";

function inPeriod(row: SignupRow, period: SignupPeriod): boolean {
  if (period === "all") return true;
  return period.length === 4 ? row.month.startsWith(period) : row.month === period;
}

function sum(rows: SignupRow[], pick: (r: SignupRow) => number | null): number {
  return rows.reduce((s, r) => s + (pick(r) ?? 0), 0);
}

export function SignupsClient({
  rows,
  awaitingSignature,
  initialProduct,
  initialPeriod,
}: {
  rows: SignupRow[];
  awaitingSignature: number;
  initialProduct: SignupProductFilter;
  initialPeriod: SignupPeriod;
}) {
  const [product, setProduct] = React.useState<SignupProductFilter>(initialProduct);
  const [period, setPeriod] = React.useState<SignupPeriod>(initialPeriod);
  const [query, setQuery] = React.useState("");
  const [showClosed, setShowClosed] = React.useState(false);
  const [customOnly, setCustomOnly] = React.useState(false);
  const [open, setOpen] = React.useState<Set<string>>(() => new Set());

  // 商品・期間は URL に残す(ブックマーク・共有したときに同じ絞り込みで開く)
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (product === "all") params.delete("product");
    else params.set("product", product);
    if (period === "all") params.delete("period");
    else params.set("period", period);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [product, period]);

  // 期間の選択肢(申込のある年・月だけ。古いブックマークの月も選択中として出す)
  const periodOptions = React.useMemo(() => {
    const months = [...new Set([...rows.map((r) => r.month), ...(initialPeriod.length === 7 ? [initialPeriod] : [])])]
      .sort()
      .reverse();
    const years = [
      ...new Set([...months.map((m) => m.slice(0, 4)), ...(initialPeriod.length === 4 ? [initialPeriod] : [])]),
    ]
      .sort()
      .reverse();
    return years.map((year) => ({
      year,
      months: months
        .filter((m) => m.startsWith(year))
        .map((m) => ({ value: m, count: rows.filter((r) => r.month === m).length })),
    }));
  }, [rows, initialPeriod]);

  const q = query.trim().toLowerCase();
  const matches = React.useCallback(
    (r: SignupRow) => {
      if (!inPeriod(r, period)) return false;
      if (!showClosed && r.closed) return false;
      if (customOnly && !r.customPrice) return false;
      if (!q) return true;
      return [r.name, r.kana, r.code, r.planName ?? "", r.channel.label].some((v) =>
        v.toLowerCase().includes(q),
      );
    },
    [period, showClosed, customOnly, q],
  );

  const scoped = rows.filter(matches);
  const visible = scoped.filter((r) => product === "all" || r.product === product);
  const countOf = (p: SignupProductFilter) =>
    p === "all" ? scoped.length : scoped.filter((r) => r.product === p).length;
  const closedCount = rows.filter((r) => r.closed && inPeriod(r, period)).length;
  const customCount = rows.filter((r) => r.customPrice && inPeriod(r, period)).length;

  // 申込月ごとにまとめる(行は申込日の新しい順に並んでいる)
  const groups: { month: string; rows: SignupRow[] }[] = [];
  for (const r of visible) {
    const last = groups[groups.length - 1];
    if (last && last.month === r.month) last.rows.push(r);
    else groups.push({ month: r.month, rows: [r] });
  }

  // マーケティング代行の状況(商品の絞り込みに関係なく、期間・検索で数える)
  const marketingRows = rows.filter(
    (r) => r.product === "marketing" && inPeriod(r, period) && (!q || r.name.toLowerCase().includes(q)),
  );
  const marketingActive = marketingRows.filter((r) => r.marketing?.status === "active").length;
  const marketingPlanned = marketingRows.filter((r) => r.marketing?.status === "planned").length;
  const marketingMinimum = sum(
    marketingRows.filter((r) => !r.closed),
    (r) => r.monthly,
  );
  const hasMarketingInView = visible.some((r) => r.product === "marketing");

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (rows.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState
          title="まだ申込はありません"
          description="申込・契約URLからお申込みが届く（または受注管理で請求を開始する）と、ここに申込日と金額が並びます。"
          icon={<ClipboardList className="h-5 w-5" />}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="申込"
          value={`${visible.length}件`}
          sub={`SalonOne ${countOf("system")}件・マーケティング代行 ${countOf("marketing")}件`}
          icon={<ClipboardList className="h-5 w-5" />}
          accent="primary"
        />
        <StatCard
          label="初期費用（税抜）"
          value={formatJPY(sum(visible, (r) => r.initialFee))}
          sub="表示中の申込の合計"
          icon={<Coins className="h-5 w-5" />}
          accent="success"
        />
        <StatCard
          label="月額（税抜）"
          value={formatJPY(sum(visible, (r) => r.monthly))}
          sub={
            hasMarketingInView
              ? "マーケティング代行は最低額で計算"
              : `税込 ${formatJPY(sum(visible, (r) => r.monthlyWithTax))}`
          }
          icon={<Repeat className="h-5 w-5" />}
          accent="primary"
        />
        <StatCard
          label="マーケティング代行"
          value={`運用中 ${marketingActive}社`}
          sub={
            marketingRows.length === 0
              ? "顧客の画面・下の詳細から登録できます"
              : `開始前 ${marketingPlanned}社・最低月額 ${formatJPY(marketingMinimum)}`
          }
          icon={<Megaphone className="h-5 w-5" />}
          accent="warning"
        />
      </div>

      <Card className="overflow-hidden">
        {/* 絞り込み */}
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="商品で絞り込み">
            {productTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={product === tab.value}
                onClick={() => setProduct(tab.value)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors",
                  product === tab.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground active:bg-muted/70",
                )}
              >
                {tab.value === "marketing" && <Megaphone className="h-3.5 w-3.5" />}
                {tab.label}
                <span className="tabular opacity-80">{countOf(tab.value)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="期間"
              className="md:h-9 sm:w-52"
            >
              <option value="all">すべての期間</option>
              {periodOptions.map((y) => (
                <optgroup key={y.year} label={`${y.year}年`}>
                  <option value={y.year}>{y.year}年（1年分）</option>
                  {y.months.map((m) => (
                    <option key={m.value} value={m.value}>
                      {formatMonthKey(m.value)}（{m.count}件）
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <div className="relative sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                enterKeyHint="search"
                placeholder="お客様名・コードで検索"
                aria-label="お客様を検索"
                className="h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9 md:text-sm"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border px-3 py-2 text-xs text-muted-foreground sm:px-4">
          <label className="inline-flex h-8 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={customOnly}
              onChange={(e) => setCustomOnly(e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            個別価格（定価と違う金額）のお客様だけ
            <span className="tabular">{customCount}</span>
          </label>
          <label className="inline-flex h-8 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            解約・見送り・停止も表示
            <span className="tabular">{closedCount}</span>
          </label>
        </div>

        {/* 見出し(PC) */}
        <div
          className={cn(
            "hidden border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground",
            COLS,
          )}
        >
          <span>申込日</span>
          <span>お客様</span>
          <span>申込内容</span>
          <span className="text-right">初期費用</span>
          <span className="text-right">月額</span>
          <span>状態</span>
          <span />
        </div>

        {groups.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">条件に合う申込はありません</p>
        ) : (
          groups.map((g) => (
            <section key={g.month} aria-label={formatMonthKey(g.month)}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border bg-muted/40 px-3 py-2 sm:px-4">
                <h2 className="text-sm font-semibold">{formatMonthKey(g.month)}</h2>
                <p className="tabular text-xs text-muted-foreground">
                  {g.rows.length}件・初期費用 {formatJPY(sum(g.rows, (r) => r.initialFee))}・月額{" "}
                  {formatJPY(sum(g.rows, (r) => r.monthly))}
                </p>
              </div>
              <ul className="divide-y divide-border">
                {g.rows.map((r) => (
                  <SignupItem key={r.key} row={r} open={open.has(r.key)} onToggle={() => toggle(r.key)} />
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>

      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          金額は税抜です。月額は毎月の請求書と同じ計算（（基本料金＋オプション）× 店舗数）で、受注確定前のお客様は契約書の金額です。マーケティング代行の月額は最低額（広告費によって増えます）。
        </p>
        {awaitingSignature > 0 && (
          <p>
            契約書の署名を待っているお客様が{awaitingSignature}件あります（まだ申込前のため、この一覧には入れていません）。
            <Link href="/orders?stage=application" className="ml-1 text-primary hover:underline">
              受注管理で見る
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * 1件分(折りたたみ時の要約 + 開いたときの内訳)
 * ------------------------------------------------------------------------- */

function SignupItem({ row, open, onToggle }: { row: SignupRow; open: boolean; onToggle: () => void }) {
  const detailId = `signup-${row.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const nameHref = row.customerId
    ? `/customers/${row.customerId}`
    : row.applicationId
      ? `/applications/${row.applicationId}`
      : null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const toggleButton = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={open}
      aria-controls={detailId}
      aria-label={open ? "内訳を閉じる" : "内訳を開く"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
    </button>
  );

  return (
    <li className={cn(row.closed && "bg-muted/30")}>
      <div
        onClick={onToggle}
        className={cn(
          "cursor-pointer px-3 py-3 transition-colors hover:bg-muted/40 sm:px-4",
          open && "bg-muted/30",
          COLS,
        )}
      >
        {/* 申込日(PC) */}
        <div className="hidden md:block">
          <div className="tabular text-sm font-medium">{row.dateLabel}</div>
          {row.dateSource === "registered" && (
            <div className="text-[11px] text-muted-foreground" title={row.dateSourceLabel}>
              登録日
            </div>
          )}
        </div>

        {/* お客様 */}
        <div className="min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2 md:hidden">
            <span className="tabular text-xs font-medium text-muted-foreground">
              {row.dateLabel}
              {row.dateSource === "registered" && <span className="ml-1 font-normal">（登録日）</span>}
            </span>
            <span className="flex items-center gap-1">
              <Badge tone={row.statusTone} dot>
                {row.statusLabel}
              </Badge>
              {toggleButton}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {row.product === "marketing" && (
              <Megaphone className="h-3.5 w-3.5 shrink-0 text-[hsl(38_55%_38%)] dark:text-accent" aria-hidden />
            )}
            {nameHref ? (
              <Link
                href={nameHref}
                onClick={stop}
                className="truncate font-semibold hover:text-primary hover:underline"
              >
                {row.name}
              </Link>
            ) : (
              <span className="truncate font-semibold">{row.name}</span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {row.code && <span className="tabular">{row.code}・</span>}
            <ChannelText channel={row.channel} />
          </div>
        </div>

        {/* 申込内容 */}
        <div className="mt-2 min-w-0 md:mt-0">
          <ContentSummary row={row} />
        </div>

        {/* 金額(スマホは2列で並べる) */}
        <div className="mt-2 grid grid-cols-2 gap-3 md:contents">
          <div className="md:text-right">
            <div className="text-[11px] text-muted-foreground md:hidden">初期費用</div>
            {row.initialFee == null ? (
              <span className="text-sm text-muted-foreground">—</span>
            ) : (
              <div className="tabular text-sm font-medium">{formatJPY(row.initialFee)}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground md:hidden">月額</div>
            {row.monthly == null ? (
              <span className="text-sm text-muted-foreground">未定</span>
            ) : (
              <>
                <div className="tabular text-base font-bold leading-tight">
                  {formatJPY(row.monthly)}
                  {row.product === "marketing" && row.marketing && row.marketing.feeRate > 0 && "〜"}
                </div>
                <div className="tabular text-[11px] text-muted-foreground">
                  {row.product === "marketing" && row.marketing && row.marketing.feeRate > 0
                    ? `広告費の${formatFeeRate(row.marketing.feeRate)}と比較`
                    : row.monthlyWithTax != null
                      ? `税込 ${formatJPY(row.monthlyWithTax)}`
                      : ""}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 状態(PC) */}
        <div className="hidden md:block">
          <Badge tone={row.statusTone} dot>
            {row.statusLabel}
          </Badge>
        </div>

        {/* 開閉(PC) */}
        <div className="hidden justify-center md:flex">{toggleButton}</div>
      </div>

      {open && (
        <div id={detailId} className="border-t border-dashed border-border bg-muted/20 px-3 py-4 sm:px-4">
          {row.product === "marketing" ? (
            <MarketingDetail row={row} />
          ) : row.customerId == null ? (
            <PendingDetail row={row} />
          ) : (
            <SystemDetail row={row} />
          )}
        </div>
      )}
    </li>
  );
}

function ChannelText({ channel }: { channel: SignupRow["channel"] }) {
  if (channel.kind === "agency") {
    return (
      <span>
        代理店 {channel.label}
        {channel.detail ? `（${channel.detail}）` : ""}
      </span>
    );
  }
  if (channel.kind === "referral") {
    return <span>紹介{channel.detail ? `（${channel.detail}様）` : ""}</span>;
  }
  return <span>直接{channel.detail ? `（${channel.detail}）` : ""}</span>;
}

function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "gold" && "bg-accent/15 text-[hsl(38_55%_30%)] dark:text-accent",
        tone === "warning" && "bg-warning/15 text-[hsl(38_92%_32%)] dark:text-warning",
      )}
    >
      {children}
    </span>
  );
}

function ContentSummary({ row }: { row: SignupRow }) {
  if (row.product === "marketing") {
    const s = row.marketing;
    return (
      <div className="min-w-0">
        <div className="text-sm font-medium">マーケティング代行</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {s?.startedOn ? (
            <Chip tone="gold">
              <Megaphone className="h-3 w-3" />
              {formatDate(s.startedOn)} 開始
            </Chip>
          ) : (
            <Chip>開始日 未定</Chip>
          )}
          {s?.endedOn && <Chip>{formatDate(s.endedOn)} 停止</Chip>}
        </div>
      </div>
    );
  }
  if (row.planName == null) {
    return <div className="text-sm text-muted-foreground">料金未定（申込のみ）</div>;
  }
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium">{row.planName}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {row.options.length === 0 ? (
          <Chip>オプションなし</Chip>
        ) : (
          row.options.map((o) => <Chip key={o.key}>{o.name}</Chip>)
        )}
        {row.storeCount > 1 && <Chip>{row.storeCount}店舗</Chip>}
        {row.customPrice && <Chip tone="warning">個別価格</Chip>}
        {row.marketing && (
          <Chip tone="gold">
            <Megaphone className="h-3 w-3" />
            マーケティング代行
          </Chip>
        )}
      </div>
    </div>
  );
}

/* ---- 内訳 ---- */

function DetailLine({
  label,
  value,
  sub,
  strong,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1", strong && "font-semibold")}>
      <dt className={cn("min-w-0", !strong && "text-muted-foreground")}>
        {label}
        {sub && <div className="text-[11px] font-normal text-muted-foreground">{sub}</div>}
      </dt>
      <dd className="tabular shrink-0 text-right">{value}</dd>
    </div>
  );
}

function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function SystemDetail({ row }: { row: SignupRow }) {
  const tax = row.monthly != null && row.monthlyWithTax != null ? row.monthlyWithTax - row.monthly : null;
  const stores = row.storeCount;
  // 複数店舗のときだけ「1店舗あたり × 店舗数」(店舗数による割引があれば段ごと)を添える
  const breakdown = (groups: StorePriceGroup[] | null) =>
    groups && stores > 1 ? describePriceGroups(groups) : undefined;
  return (
    <div className="grid gap-5 text-sm md:grid-cols-2">
      <div>
        <h3 className="mb-1 text-xs font-semibold text-muted-foreground">料金の内訳（税抜）</h3>
        {row.monthly == null ? (
          <p className="text-muted-foreground">料金はまだ決まっていません。</p>
        ) : (
          <dl className="divide-y divide-border/70 rounded-md border border-border bg-card px-3">
            {row.baseGroups && (
              <DetailLine
                label={
                  <>
                    基本料金
                    {row.baseCustom && row.listBasePerStore != null && (
                      <span className="ml-1.5 text-[11px]">
                        （定価 <span className="line-through">{formatJPY(row.listBasePerStore)}</span>）
                      </span>
                    )}
                    {row.baseGroups.length > 1 && <span className="ml-1.5 text-[11px]">（店舗数による割引）</span>}
                  </>
                }
                sub={breakdown(row.baseGroups)}
                value={formatJPY(priceGroupsTotal(row.baseGroups))}
              />
            )}
            {row.options.map((o) => (
              <DetailLine
                key={o.key}
                label={o.name}
                sub={breakdown(flatPriceGroups(o.monthly, stores))}
                value={formatJPY(o.monthly * stores)}
              />
            ))}
            <DetailLine label="月額" value={formatJPY(row.monthly)} strong />
            {tax != null && <DetailLine label="消費税" value={formatJPY(tax)} />}
            {row.monthlyWithTax != null && <DetailLine label="月額（税込）" value={formatJPY(row.monthlyWithTax)} strong />}
            <DetailLine
              label={
                <>
                  初期費用
                  {row.listInitialFee != null && row.initialFee != null && row.initialFee !== row.listInitialFee && (
                    <span className="ml-1.5 text-[11px]">
                      （定価 <span className="line-through">{formatJPY(row.listInitialFee)}</span>）
                    </span>
                  )}
                </>
              }
              sub={breakdown(row.initialFeeGroups)}
              value={row.initialFee == null ? "記録なし" : formatJPY(row.initialFee)}
            />
          </dl>
        )}
        {row.signupMonthly != null && row.monthly != null && row.signupMonthly !== row.monthly && (
          <p className="mt-2 text-xs text-muted-foreground">
            申込時（契約書）の月額は {formatJPY(row.signupMonthly)} でした。その後の変更を反映しています。
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">申込の情報</h3>
          <dl className="text-sm">
            <InfoLine label="申込日">
              <span className="tabular">{formatDate(row.date)}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">{row.dateSourceLabel}</span>
            </InfoLine>
            <InfoLine label="利用開始日">
              {row.startedOnLabel ?? <span className="text-muted-foreground">受注確定前</span>}
            </InfoLine>
            <InfoLine label="経路">
              <ChannelText channel={row.channel} />
            </InfoLine>
            {row.contractId && (
              <InfoLine label="契約書">
                <Link href={`/contracts/${row.contractId}`} className="text-primary hover:underline">
                  {row.contractNumber ?? "契約書を開く"}
                </Link>
              </InfoLine>
            )}
            <InfoLine label="マーケティング代行">
              {row.marketing ? (
                <span>
                  {marketingStatusLabels[row.marketing.status]}・月額 {formatJPY(row.marketing.monthlyMinimum)}
                  {row.marketing.feeRate > 0 ? "〜" : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">利用なし</span>
              )}
            </InfoLine>
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          {row.customerId && (
            <>
              <Link href={`/customers/${row.customerId}`} className={buttonClasses({ variant: "outline", size: "sm" })}>
                <UserRound className="h-3.5 w-3.5" />
                お客様のページ
              </Link>
              <Link href={`/orders/${row.customerId}`} className={buttonClasses({ variant: "outline", size: "sm" })}>
                <SquareKanban className="h-3.5 w-3.5" />
                受注管理の案件
              </Link>
              <MarketingServiceButton
                customerId={row.customerId}
                customerName={row.name}
                service={row.marketing}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MarketingDetail({ row }: { row: SignupRow }) {
  const s = row.marketing;
  if (!s || !row.customerId) return null;
  const breakEven = marketingBreakEvenAdSpend(s);
  return (
    <div className="grid gap-5 text-sm md:grid-cols-2">
      <div>
        <h3 className="mb-1 text-xs font-semibold text-muted-foreground">料金（税抜）</h3>
        <dl className="divide-y divide-border/70 rounded-md border border-border bg-card px-3">
          <DetailLine label="初期構築費用" value={formatJPY(s.initialFee)} />
          <DetailLine
            label="月額運用費"
            sub={
              breakEven != null
                ? `広告費が${formatJPY(breakEven)}を超える月は、広告費の${formatFeeRate(s.feeRate)}`
                : "固定額"
            }
            value={`${formatJPY(s.monthlyMinimum)}${s.feeRate > 0 ? "〜" : ""}`}
            strong
          />
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          広告費そのものは別にお客様へ請求します。請求書は広告費が確定してから作成してください（自動では作りません）。
        </p>
      </div>
      <div className="space-y-4">
        <div>
          <h3 className="mb-1 text-xs font-semibold text-muted-foreground">申込の情報</h3>
          <dl className="text-sm">
            <InfoLine label="申込日">
              <span className="tabular">{formatDate(row.date)}</span>
            </InfoLine>
            <InfoLine label="運用の開始日">
              {s.startedOn ? formatDate(s.startedOn) : <span className="text-muted-foreground">未定</span>}
            </InfoLine>
            {s.endedOn && <InfoLine label="停止日">{formatDate(s.endedOn)}</InfoLine>}
            <InfoLine label="経路">
              <ChannelText channel={row.channel} />
            </InfoLine>
            {s.note && (
              <InfoLine label="メモ">
                <span className="whitespace-pre-wrap">{s.note}</span>
              </InfoLine>
            )}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/customers/${row.customerId}`} className={buttonClasses({ variant: "outline", size: "sm" })}>
            <UserRound className="h-3.5 w-3.5" />
            お客様のページ
          </Link>
          <MarketingServiceButton customerId={row.customerId} customerName={row.name} service={s} />
        </div>
      </div>
    </div>
  );
}

function PendingDetail({ row }: { row: SignupRow }) {
  return (
    <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">
        「申込のみ」のURLから届いた申込です。料金はまだ決まっていません。受注管理で顧客として登録し、契約書を送ってください。
      </p>
      {row.applicationId && (
        <Link
          href={`/applications/${row.applicationId}`}
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          <FileSignature className="h-3.5 w-3.5" />
          申込の内容を見る
        </Link>
      )}
    </div>
  );
}
