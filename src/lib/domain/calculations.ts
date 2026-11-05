import { daysUntil, toISODate } from "@/lib/utils";
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Plan,
  StorePriceGroup,
  StoreTier,
  Subscription,
} from "./types";

/** 明細1行の税抜金額 */
export function lineAmount(item: Pick<InvoiceItem, "quantity" | "unitPrice">): number {
  return Math.round(item.quantity * item.unitPrice);
}

export interface InvoiceTotals {
  subtotal: number;
  taxTotal: number;
  total: number;
  /** 税率別の内訳(適格請求書向け) */
  taxBreakdown: { rate: number; base: number; tax: number }[];
}

/** 明細から小計・消費税・合計を算出。税率別に端数処理(四捨五入)。 */
export function calcInvoiceTotals(items: InvoiceItem[]): InvoiceTotals {
  const byRate = new Map<number, number>();
  let subtotal = 0;
  for (const item of items) {
    const base = lineAmount(item);
    subtotal += base;
    byRate.set(item.taxRate, (byRate.get(item.taxRate) ?? 0) + base);
  }
  const taxBreakdown = [...byRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, base]) => ({
      rate,
      base,
      tax: Math.round(base * rate),
    }));
  const taxTotal = taxBreakdown.reduce((s, b) => s + b.tax, 0);
  return { subtotal, taxTotal, total: subtotal + taxTotal, taxBreakdown };
}

/** 請求書番号の生成 (PREFIX-YYYYMM-#### )。連番はその月の件数+1。 */
export function nextInvoiceNumber(
  prefix: string,
  issueDate: string,
  existingNumbers: string[],
): string {
  const d = new Date(issueDate);
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const head = `${prefix}-${ym}-`;
  const seqs = existingNumbers
    .filter((n) => n.startsWith(head))
    .map((n) => parseInt(n.slice(head.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
  return `${head}${String(next).padStart(4, "0")}`;
}

/**
 * 表示用の実効ステータス。
 * 未入金かつ支払期限を過ぎている場合は overdue とみなす(保存値が sent 等でも)。
 */
export function effectiveStatus(
  inv: Pick<Invoice, "status" | "amountPaid" | "total" | "dueDate">,
  asOf = new Date(),
): InvoiceStatus {
  if (inv.status === "paid" || inv.status === "canceled" || inv.status === "draft") {
    return inv.status;
  }
  if (inv.amountPaid >= inv.total && inv.total > 0) return "paid";
  if (inv.status === "failed") return "failed";
  if (daysUntil(inv.dueDate, asOf) < 0 && inv.amountPaid < inv.total) {
    return "overdue";
  }
  return inv.status;
}

/** 未収残高 (合計 - 入金済) */
export function outstandingAmount(inv: Pick<Invoice, "total" | "amountPaid">): number {
  return Math.max(0, inv.total - inv.amountPaid);
}

/** 選択中のオプションを返す */
export function selectedOptions(plan: Pick<Plan, "options">, optionKeys: string[] = []) {
  return plan.options.filter((o) => optionKeys.includes(o.key));
}

/* ---------------------------------------------------------------------------
 * 店舗数による割引(ボリューム割引)
 * ------------------------------------------------------------------------- */

/**
 * 店舗数による割引の段をそろえる。
 * 2〜99店舗目から・金額は0以上の整数・初期費用も月額も空の段は捨てる・同じ開始店舗は後のものを使う。
 */
export function normalizeStoreTiers(raw: unknown): StoreTier[] {
  if (!Array.isArray(raw)) return [];
  const amount = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const byFrom = new Map<number, StoreTier>();
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const r = t as Record<string, unknown>;
    const fromStore = Math.round(Number(r.fromStore));
    if (!Number.isFinite(fromStore) || fromStore < 2 || fromStore > 99) continue;
    const initialFee = amount(r.initialFee);
    const monthly = amount(r.monthly);
    if (initialFee == null && monthly == null) continue;
    byFrom.set(fromStore, { fromStore, initialFee, monthly });
  }
  return [...byFrom.values()].sort((a, b) => a.fromStore - b.fromStore);
}

/**
 * 1店舗目から店舗数までの「1店舗あたりの金額」を、同じ金額の店舗ごとにまとめる。
 * 割引の段が無ければ、全店舗が basePerStore の1まとまり。
 * field で初期費用(initialFee)か月額基本料金(monthly)の段を使う(その項目が空の段は使わない)。
 */
export function storePriceGroups(
  basePerStore: number,
  tiers: StoreTier[] | null | undefined,
  field: "initialFee" | "monthly",
  storeCount: number | null | undefined,
): StorePriceGroup[] {
  const n = normalizeStoreCount(storeCount);
  const steps = normalizeStoreTiers(tiers ?? []).filter((t) => t[field] != null);
  const groups: StorePriceGroup[] = [];
  for (let i = 1; i <= n; i++) {
    let price = basePerStore;
    for (const t of steps) if (i >= t.fromStore) price = t[field] as number;
    const last = groups[groups.length - 1];
    if (last && last.unitPrice === price) last.to = i;
    else groups.push({ from: i, to: i, unitPrice: price });
  }
  return groups;
}

/** まとまりごとの金額の合計(税抜) */
export function priceGroupsTotal(groups: Pick<StorePriceGroup, "from" | "to" | "unitPrice">[]): number {
  return groups.reduce((s, g) => s + (g.to - g.from + 1) * g.unitPrice, 0);
}

/** 「1店舗目」「2店舗目」「2〜3店舗目」 */
export function storeRangeLabel(group: Pick<StorePriceGroup, "from" | "to">): string {
  return group.from === group.to ? `${group.from}店舗目` : `${group.from}〜${group.to}店舗目`;
}

/**
 * 基本料金 + 選択オプションの月額合計(税抜)。
 * priceOverride(個別価格)が設定されていれば基本料金をそちらで置き換える(全店舗同じ金額)。
 * 料金は1店舗あたりなので、storeCount(契約店舗数)を掛けた額を返す。
 * storeTiers(店舗数による割引)があれば、基本料金は段ごとの金額で数える(オプションは全店舗同じ金額)。
 */
export function subscriptionMonthly(
  plan: Pick<Plan, "amount" | "options">,
  optionKeys: string[] = [],
  priceOverride?: number | null,
  storeCount = 1,
  storeTiers?: StoreTier[] | null,
): number {
  const n = normalizeStoreCount(storeCount);
  const optionsPerStore = selectedOptions(plan, optionKeys).reduce((s, o) => s + o.monthly, 0);
  const base =
    priceOverride != null
      ? priceOverride * n
      : priceGroupsTotal(storePriceGroups(plan.amount, storeTiers, "monthly", n));
  return base + optionsPerStore * n;
}

/** 定期契約の月額合計(税抜)。契約に写した店舗数による割引(締結時点のもの)で数える */
export function subscriptionMonthlyOf(
  plan: Pick<Plan, "amount" | "options">,
  sub: Pick<Subscription, "optionKeys" | "priceOverride" | "storeCount" | "storeTiers">,
): number {
  return subscriptionMonthly(plan, sub.optionKeys ?? [], sub.priceOverride, sub.storeCount ?? 1, sub.storeTiers);
}

/** 店舗数を1以上の整数にそろえる(未設定・不正値は1店舗) */
export function normalizeStoreCount(storeCount: number | null | undefined): number {
  const n = Math.round(Number(storeCount ?? 1));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** 消費税額 (税抜 × 税率、四捨五入) */
export function taxAmount(exclusive: number, rate: number): number {
  return Math.round(exclusive * rate);
}

/** 税込金額 (税抜 + 消費税) */
export function withTax(exclusive: number, rate: number): number {
  return exclusive + taxAmount(exclusive, rate);
}

/**
 * 定期プラン(基本料金＋オプション)から請求明細を生成。個別価格があれば適用。
 * 複数店舗の契約は、数量に店舗数を入れて「1店舗あたりの単価 × 店舗数」で明細化する。
 */
export function subscriptionItems(
  plan: Plan,
  optionKeys: string[],
  billingPeriod: string,
  priceOverride?: number | null,
  storeCount = 1,
  storeTiers?: StoreTier[] | null,
): Omit<InvoiceItem, "id">[] {
  const qty = normalizeStoreCount(storeCount);
  const perStore = qty > 1 ? `・${qty}店舗` : "";
  // 個別価格は全店舗同じ金額。店舗数による割引があれば、段ごとに明細を分ける
  const groups =
    priceOverride != null
      ? [{ from: 1, to: qty, unitPrice: priceOverride }]
      : storePriceGroups(plan.amount, storeTiers, "monthly", qty);
  const items: Omit<InvoiceItem, "id">[] =
    groups.length === 1
      ? [
          {
            description: `${plan.name}（${billingPeriod}${perStore}）${priceOverride != null ? "※個別価格" : ""}`,
            quantity: qty,
            unitPrice: groups[0].unitPrice,
            taxRate: plan.taxRate,
            amount: groups[0].unitPrice * qty,
          },
        ]
      : groups.map((g) => {
          const q = g.to - g.from + 1;
          return {
            description: `${plan.name}（${billingPeriod}・${storeRangeLabel(g)}）`,
            quantity: q,
            unitPrice: g.unitPrice,
            taxRate: plan.taxRate,
            amount: g.unitPrice * q,
          };
        });
  for (const opt of selectedOptions(plan, optionKeys)) {
    items.push({
      description: `オプション: ${opt.name}${perStore ? `（${qty}店舗）` : ""}`,
      quantity: qty,
      unitPrice: opt.monthly,
      taxRate: plan.taxRate,
      amount: opt.monthly * qty,
    });
  }
  return items;
}

/**
 * 定期請求を作成する対象の締め日(asOf の月末)。
 * 次回請求日(= 引き落とし日・支払期限)がこの日までの契約は、その月の1日を発行日として
 * 請求書を作る。引き落とし日(27日)の当日ではなく月初に作ることで、お客様の確認期間と
 * NSS への金額登録の時間を確保する。
 */
export function recurringBillingCutoff(asOfDate: string): string {
  const [y, m] = asOfDate.slice(0, 7).split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${asOfDate.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

/** 指定した月(YYYY-MM)の請求日。billingDay をその月に当てはめる(末日補正あり) */
export function billingDateInMonth(month: string, billingDay: number): string {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(1, Math.round(billingDay) || 1), lastDay);
  return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * 次回請求日を計算。billingDay を指定月に適用(末日補正あり)。
 * fromDate の翌月の billingDay を返す。
 */
export function computeNextBillingDate(fromDate: string, billingDay: number): string {
  const d = new Date(fromDate);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 翌月へ
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(billingDay, lastDay);
  return toISODate(new Date(year, month, day));
}

/** 請求書の支払期限を発行日から算出 (既定: 翌月末) */
export function computeDueDate(issueDate: string, daysOrEom: "eom" | number = "eom"): string {
  // 日付の計算は UTC で行う(画面の時差で月末が前日にずれないように)
  const [y, m, d] = issueDate.slice(0, 10).split("-").map(Number);
  if (daysOrEom === "eom") {
    // 翌月末
    return new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(y, m - 1, d + daysOrEom)).toISOString().slice(0, 10);
}

/* ---- 未収金エイジング ---- */

/** 未収金の期限超過日数バケット */
export interface AgingBucket {
  key: "current" | "d1_30" | "d31_60" | "d61";
  label: string;
  amount: number;
  count: number;
}

/**
 * 未収金のエイジング(支払期限からの経過日数別の残高)。
 * 督促の優先順位づけに使う。実効ステータスで未入金の請求のみ集計する。
 */
export function computeAgingBuckets(
  invoices: Pick<Invoice, "status" | "amountPaid" | "total" | "dueDate">[],
  asOf = new Date(),
): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { key: "current", label: "期限内", amount: 0, count: 0 },
    { key: "d1_30", label: "超過 1〜30日", amount: 0, count: 0 },
    { key: "d31_60", label: "超過 31〜60日", amount: 0, count: 0 },
    { key: "d61", label: "超過 61日以上", amount: 0, count: 0 },
  ];
  const unpaidStatuses: InvoiceStatus[] = [
    "sent",
    "awaiting_payment",
    "partially_paid",
    "overdue",
    "failed",
  ];
  for (const inv of invoices) {
    const status = effectiveStatus(inv, asOf);
    if (!unpaidStatuses.includes(status)) continue;
    const remain = outstandingAmount(inv);
    if (remain <= 0) continue;
    const overdueDays = -daysUntil(inv.dueDate, asOf);
    const bucket =
      overdueDays <= 0
        ? buckets[0]
        : overdueDays <= 30
          ? buckets[1]
          : overdueDays <= 60
            ? buckets[2]
            : buckets[3];
    bucket.amount += remain;
    bucket.count += 1;
  }
  return buckets;
}

/** 月額料金の初月日割り。開始日〜月末を暦日で按分し、1円未満は切り捨て(顧客有利)。 */
export interface ProrationResult {
  /** 日割り金額(税抜) */
  amount: number;
  /** 課金対象日数(開始日〜月末) */
  days: number;
  daysInMonth: number;
  /** 表示用ラベル(例: 8月22日〜月末・10日分) */
  label: string;
}

export function prorateMonthly(monthly: number, startDate: string): ProrationResult {
  const d = new Date(startDate);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const days = daysInMonth - d.getDate() + 1;
  const amount = Math.floor((monthly * days) / daysInMonth);
  const label = `${d.getMonth() + 1}月${d.getDate()}日〜月末・${days}日分`;
  return { amount, days, daysInMonth, label };
}

/** billingPeriod (YYYY-MM) を「2026年7月分」表記に */
export function formatBillingPeriod(period: string | null): string {
  if (!period) return "—";
  const [y, m] = period.split("-");
  return `${y}年${Number(m)}月分`;
}
