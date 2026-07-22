import { daysUntil, toISODate } from "@/lib/utils";
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Plan,
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
export function effectiveStatus(inv: Invoice, asOf = new Date()): InvoiceStatus {
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
export function outstandingAmount(inv: Invoice): number {
  return Math.max(0, inv.total - inv.amountPaid);
}

/** 選択中のオプションを返す */
export function selectedOptions(plan: Plan, optionKeys: string[] = []) {
  return plan.options.filter((o) => optionKeys.includes(o.key));
}

/**
 * 基本料金 + 選択オプションの月額合計(税抜)。
 * priceOverride(個別価格)が設定されていれば基本料金をそちらで置き換える。
 */
export function subscriptionMonthly(
  plan: Plan,
  optionKeys: string[] = [],
  priceOverride?: number | null,
): number {
  const base = priceOverride ?? plan.amount;
  return base + selectedOptions(plan, optionKeys).reduce((s, o) => s + o.monthly, 0);
}

/** 消費税額 (税抜 × 税率、四捨五入) */
export function taxAmount(exclusive: number, rate: number): number {
  return Math.round(exclusive * rate);
}

/** 税込金額 (税抜 + 消費税) */
export function withTax(exclusive: number, rate: number): number {
  return exclusive + taxAmount(exclusive, rate);
}

/** 定期プラン(基本料金＋オプション)から請求明細を生成。個別価格があれば適用。 */
export function subscriptionItems(
  plan: Plan,
  optionKeys: string[],
  billingPeriod: string,
  priceOverride?: number | null,
): Omit<InvoiceItem, "id">[] {
  const base = priceOverride ?? plan.amount;
  const items: Omit<InvoiceItem, "id">[] = [
    {
      description: `${plan.name}（${billingPeriod}）${priceOverride != null ? "※個別価格" : ""}`,
      quantity: 1,
      unitPrice: base,
      taxRate: plan.taxRate,
      amount: base,
    },
  ];
  for (const opt of selectedOptions(plan, optionKeys)) {
    items.push({
      description: `オプション: ${opt.name}`,
      quantity: 1,
      unitPrice: opt.monthly,
      taxRate: plan.taxRate,
      amount: opt.monthly,
    });
  }
  return items;
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
  const d = new Date(issueDate);
  if (daysOrEom === "eom") {
    // 翌月末
    return toISODate(new Date(d.getFullYear(), d.getMonth() + 2, 0));
  }
  const due = new Date(d);
  due.setDate(due.getDate() + daysOrEom);
  return toISODate(due);
}

/** billingPeriod (YYYY-MM) を「2026年7月分」表記に */
export function formatBillingPeriod(period: string | null): string {
  if (!period) return "—";
  const [y, m] = period.split("-");
  return `${y}年${Number(m)}月分`;
}
