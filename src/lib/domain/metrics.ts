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

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const inMonth = (dateStr: string, target: string) => (dateStr ?? "").startsWith(target);

/**
 * ダッシュボード指標の算出（純粋関数）。
 * デモ / Supabase 双方のリポジトリから同じロジックで利用する。
 */
export function computeDashboardMetrics(input: {
  invoices: Invoice[];
  payments: Payment[];
  subscriptions: Subscription[];
  plans: Plan[];
  customers: Customer[];
  now?: Date;
}): DashboardMetrics {
  const now = input.now ?? new Date();
  const thisYm = ym(now);
  const lastYm = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const invoices = input.invoices.map((i) => ({ ...i, status: effectiveStatus(i, now) }));

  const billable = (i: Invoice) => i.status !== "canceled" && i.status !== "draft";

  const monthInvoiced = invoices
    .filter((i) => billable(i) && inMonth(i.issueDate, thisYm))
    .reduce((s, i) => s + i.total, 0);
  const lastMonthInvoiced = invoices
    .filter((i) => billable(i) && inMonth(i.issueDate, lastYm))
    .reduce((s, i) => s + i.total, 0);

  const monthCollected = input.payments
    .filter((p) => p.status === "confirmed" && inMonth(p.paidAt, thisYm))
    .reduce((s, p) => s + p.amount, 0);

  const outstanding = invoices
    .filter((i) => OUTSTANDING_STATUSES.includes(i.status))
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

  const monthlyTrend = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const key = ym(d);
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
    (p) => p.status === "confirmed" && inMonth(p.paidAt, thisYm),
  )) {
    methodMap.set(p.method, (methodMap.get(p.method) ?? 0) + p.amount);
  }
  const collectionByMethod = [...methodMap.entries()].map(([method, amount]) => ({
    method,
    amount,
  }));

  return {
    monthInvoiced,
    monthCollected,
    outstanding,
    overdueCount: overdue.length,
    overdueAmount,
    mrr,
    activeCustomers: input.customers.filter((c) => c.status === "active").length,
    activeSubscriptions: input.subscriptions.filter((s) => s.status === "active").length,
    awaitingCount: awaiting.length,
    awaitingAmount,
    invoicedMoM:
      lastMonthInvoiced === 0 ? 0 : (monthInvoiced - lastMonthInvoiced) / lastMonthInvoiced,
    monthlyTrend,
    collectionByMethod,
  };
}
