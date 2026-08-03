import { addMonths, currentMonth, isMonthKey } from "@/lib/utils";
import { effectiveStatus, outstandingAmount, subscriptionMonthly } from "./calculations";
import { OUTSTANDING_STATUSES } from "./constants";
import type {
  Customer,
  DashboardMetrics,
  Invoice,
  PaymentMethod,
  Payment,
  Plan,
  Subscription,
} from "./types";

const inMonth = (dateStr: string, target: string) => (dateStr ?? "").startsWith(target);

/**
 * ダッシュボード指標の算出（純粋関数）。
 * デモ / Supabase 双方のリポジトリから同じロジックで利用する。
 *
 * 指標は2種類ある。
 * - 対象月の指標: 請求額・入金額・入金内訳・前月比・推移（`month` で切り替わる）
 * - 現在の指標: 未収金・期限超過・入金待ち・MRR・顧客数（月に関係なく「いま」の状況）
 */
export function computeDashboardMetrics(input: {
  invoices: Invoice[];
  payments: Payment[];
  subscriptions: Subscription[];
  plans: Plan[];
  customers: Customer[];
  now?: Date;
  /** 集計対象の月 (YYYY-MM)。省略時は当月。 */
  month?: string;
}): DashboardMetrics {
  const now = input.now ?? new Date();
  const targetYm = isMonthKey(input.month) ? input.month : currentMonth(now);
  const prevYm = addMonths(targetYm, -1);
  const invoices = input.invoices.map((i) => ({ ...i, status: effectiveStatus(i, now) }));

  const billable = (i: Invoice) => i.status !== "canceled" && i.status !== "draft";

  const monthInvoiced = invoices
    .filter((i) => billable(i) && inMonth(i.issueDate, targetYm))
    .reduce((s, i) => s + i.total, 0);
  const prevMonthInvoiced = invoices
    .filter((i) => billable(i) && inMonth(i.issueDate, prevYm))
    .reduce((s, i) => s + i.total, 0);

  const monthCollected = input.payments
    .filter((p) => p.status === "confirmed" && inMonth(p.paidAt, targetYm))
    .reduce((s, p) => s + p.amount, 0);

  const unpaid = invoices.filter((i) => OUTSTANDING_STATUSES.includes(i.status));
  const outstanding = unpaid.reduce((s, i) => s + outstandingAmount(i), 0);
  const monthOutstanding = unpaid
    .filter((i) => inMonth(i.issueDate, targetYm))
    .reduce((s, i) => s + outstandingAmount(i), 0);

  const overdue = invoices.filter((i) => i.status === "overdue" || i.status === "failed");
  const overdueAmount = overdue.reduce((s, i) => s + outstandingAmount(i), 0);

  const awaiting = invoices.filter((i) => i.status === "awaiting_payment");
  const awaitingAmount = awaiting.reduce((s, i) => s + outstandingAmount(i), 0);

  const mrr = input.subscriptions
    .filter((sub) => sub.status === "active")
    .reduce((s, sub) => {
      const plan = input.plans.find((p) => p.id === sub.planId);
      if (!plan) return s;
      const monthly = subscriptionMonthly(plan, sub.optionKeys ?? [], sub.priceOverride);
      // 年間プランは月換算(=月額合計)でMRRに計上
      return s + Math.round(monthly * (1 + plan.taxRate));
    }, 0);

  // 対象月を末尾とする直近6ヶ月
  const monthlyTrend = [];
  for (let m = 5; m >= 0; m--) {
    const key = addMonths(targetYm, -m);
    const invoiced = invoices
      .filter((i) => billable(i) && inMonth(i.issueDate, key))
      .reduce((s, i) => s + i.total, 0);
    const collected = input.payments
      .filter((p) => p.status === "confirmed" && inMonth(p.paidAt, key))
      .reduce((s, p) => s + p.amount, 0);
    monthlyTrend.push({ month: key, invoiced, collected });
  }

  const methodMap = new Map<PaymentMethod | "adjustment", number>();
  for (const p of input.payments.filter(
    (p) => p.status === "confirmed" && inMonth(p.paidAt, targetYm),
  )) {
    methodMap.set(p.method, (methodMap.get(p.method) ?? 0) + p.amount);
  }
  const collectionByMethod = [...methodMap.entries()].map(([method, amount]) => ({
    method,
    amount,
  }));

  return {
    month: targetYm,
    monthInvoiced,
    monthCollected,
    monthOutstanding,
    outstanding,
    overdueCount: overdue.length,
    overdueAmount,
    mrr,
    activeCustomers: input.customers.filter((c) => c.status === "active").length,
    activeSubscriptions: input.subscriptions.filter((s) => s.status === "active").length,
    awaitingCount: awaiting.length,
    awaitingAmount,
    invoicedMoM:
      prevMonthInvoiced === 0 ? 0 : (monthInvoiced - prevMonthInvoiced) / prevMonthInvoiced,
    monthlyTrend,
    collectionByMethod,
  };
}
