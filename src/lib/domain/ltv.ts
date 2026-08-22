import { addMonths, currentMonth } from "@/lib/utils";
import type { Customer, Payment } from "./types";

/**
 * 顧客LTV(累計入金額)の算出。
 * 「毎月いくら払っているか」「これまでの累計いくらか」を可視化するための純関数。
 * 入金(確認済み)を月ごとに集計し、累計を積み上げる。調整(返金・値引き)も含む。
 */

export interface LtvPoint {
  /** 年月キー (YYYY-MM) */
  month: string;
  /** その月の入金額 */
  amount: number;
  /** 累計入金額(LTV) */
  cumulative: number;
}

export interface CustomerLtv {
  customerId: string;
  /** 累計入金額(=LTV) */
  total: number;
  /** 初回入金からの経過月数(当月含む)。入金が無ければ 0 */
  monthsActive: number;
  /** 平均月額 (累計 ÷ 経過月数) */
  averageMonthly: number;
  /** 直近12ヶ月の入金額 */
  last12: number;
  /** 初回入金月 (YYYY-MM) */
  firstPaymentMonth: string | null;
  /** 最終入金日 */
  lastPaymentAt: string | null;
  /** 月別の入金と累計(古い順)。開始月〜当月まで欠損月は 0 で埋める。 */
  series: LtvPoint[];
}

/** 年月キーの差 (b - a、月数) */
function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

export function computeCustomerLtv(
  customer: Pick<Customer, "id" | "createdAt">,
  payments: Pick<Payment, "customerId" | "status" | "amount" | "paidAt">[],
  opts?: { now?: Date; maxMonths?: number },
): CustomerLtv {
  const nowYm = currentMonth(opts?.now);
  const maxMonths = opts?.maxMonths ?? 24;

  const confirmed = payments.filter(
    (p) => p.customerId === customer.id && p.status === "confirmed" && !!p.paidAt,
  );

  const byMonth = new Map<string, number>();
  let firstPaymentMonth: string | null = null;
  let lastPaymentAt: string | null = null;
  for (const p of confirmed) {
    const ym = p.paidAt.slice(0, 7);
    byMonth.set(ym, (byMonth.get(ym) ?? 0) + p.amount);
    if (!firstPaymentMonth || ym < firstPaymentMonth) firstPaymentMonth = ym;
    if (!lastPaymentAt || p.paidAt > lastPaymentAt) lastPaymentAt = p.paidAt;
  }

  const total = confirmed.reduce((s, p) => s + p.amount, 0);

  // 系列の開始月: 初回入金月(無ければ顧客登録月)。未来にはならないよう丸める。
  const createdYm = (customer.createdAt || "").slice(0, 7);
  let startYm = firstPaymentMonth ?? (createdYm && createdYm <= nowYm ? createdYm : nowYm);
  if (startYm > nowYm) startYm = nowYm;
  // 表示上限(既定24ヶ月)を超える場合は直近のみ(累計は全期間分を引き継ぐ)
  const spanMonths = monthDiff(startYm, nowYm) + 1;
  const clippedStart = spanMonths > maxMonths ? addMonths(nowYm, -(maxMonths - 1)) : startYm;

  // 表示開始月より前の入金は累計の初期値として引き継ぐ
  let cumulative = 0;
  for (const [ym, amount] of byMonth) {
    if (ym < clippedStart) cumulative += amount;
  }

  const series: LtvPoint[] = [];
  for (let ym = clippedStart; ym <= nowYm; ym = addMonths(ym, 1)) {
    const amount = byMonth.get(ym) ?? 0;
    cumulative += amount;
    series.push({ month: ym, amount, cumulative });
  }

  const last12Start = addMonths(nowYm, -11);
  let last12 = 0;
  for (const [ym, amount] of byMonth) {
    if (ym >= last12Start && ym <= nowYm) last12 += amount;
  }

  const monthsActive = firstPaymentMonth ? monthDiff(firstPaymentMonth, nowYm) + 1 : 0;
  const averageMonthly = monthsActive > 0 ? Math.round(total / monthsActive) : 0;

  return {
    customerId: customer.id,
    total,
    monthsActive,
    averageMonthly,
    last12,
    firstPaymentMonth,
    lastPaymentAt,
    series,
  };
}
