import { effectiveStatus } from "./calculations";
import { isInitialFeeLine } from "./client-pricing";
import { AGENCY_DEAL_TYPES } from "./constants";
import type {
  Agency,
  AgencyCommission,
  Customer,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceType,
  Payment,
  Referral,
} from "./types";

/**
 * 売上の計上(純粋関数)。売上台帳(税理士さん向けのページ)と CSV が使う。
 *
 * 計上月 = サービスを提供した月。
 *   - 明細に計上月(serviceMonth)があればその月(初期費用は利用を始めた月、さかのぼった月額はその月)
 *   - 無ければ、定期請求の請求書は対象月(billingPeriod)、それ以外は発行月
 * 請求書をあとから出しても、計上月は動かさない。取消の請求書と、削除したお客様の請求書は含めない。
 */

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** 計上月の入力を 'YYYY-MM' か null にそろえる */
export function normalizeServiceMonth(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, 7);
  return MONTH_RE.test(v) ? v : null;
}

/** 決算月を 1〜12 にそろえる(不正値・未設定は3月) */
export function normalizeFiscalYearEndMonth(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 3;
}

/** 'YYYY-MM' に月を足す */
export function addMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 「2026年8月」 */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

/** 明細の計上月と、その決め方 */
export function revenueMonthOf(
  item: Pick<InvoiceItem, "serviceMonth">,
  invoice: Pick<Invoice, "type" | "billingPeriod" | "issueDate">,
): { month: string; source: "explicit" | "period" | "issue" } {
  const explicit = normalizeServiceMonth(item.serviceMonth);
  if (explicit) return { month: explicit, source: "explicit" };
  const period = normalizeServiceMonth(invoice.billingPeriod);
  if (invoice.type === "recurring" && period) return { month: period, source: "period" };
  return { month: invoice.issueDate.slice(0, 7), source: "issue" };
}

/* ---------------------------------------------------------------------------
 * 決算期
 * ------------------------------------------------------------------------- */

export interface FiscalYear {
  /** 決算の年(2027 = 2027年6月期) */
  endYear: number;
  endMonth: number;
  /** 期首の月 'YYYY-MM' */
  first: string;
  /** 期末の月 'YYYY-MM' */
  last: string;
  /** 期の12か月('YYYY-MM') */
  months: string[];
  /** 「2027年6月期」 */
  label: string;
  /** 「2026年7月〜2027年6月」 */
  rangeLabel: string;
}

/** その月が入る決算期の決算の年 */
export function fiscalYearEndYearOf(month: string, endMonth: number): number {
  const [y, m] = month.split("-").map(Number);
  return m > endMonth ? y + 1 : y;
}

export function fiscalYear(endYear: number, endMonth: number): FiscalYear {
  const last = `${endYear}-${String(endMonth).padStart(2, "0")}`;
  const first = addMonthKey(last, -11);
  const months = Array.from({ length: 12 }, (_, i) => addMonthKey(first, i));
  return {
    endYear,
    endMonth,
    first,
    last,
    months,
    label: `${endYear}年${endMonth}月期`,
    rangeLabel: `${monthLabel(first)}〜${monthLabel(last)}`,
  };
}

/* ---------------------------------------------------------------------------
 * 売上台帳
 * ------------------------------------------------------------------------- */

export type RevenueKind = "initial" | "monthly" | "other";

export const revenueKindLabels: Record<RevenueKind, string> = {
  initial: "初期費用",
  monthly: "月額",
  other: "その他",
};

export interface RevenueLine {
  key: string;
  /** 計上月 'YYYY-MM' */
  month: string;
  monthSource: "explicit" | "period" | "issue";
  customerId: string;
  customerName: string;
  customerCode: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  issueDate: string;
  status: InvoiceStatus;
  description: string;
  kind: RevenueKind;
  taxRate: number;
  /** 税抜 */
  amount: number;
  /** 消費税(請求書の税率ごとの消費税を明細に割り振ったもの) */
  tax: number;
  /** 税込 */
  total: number;
  /** 請求書が入金済みか */
  paid: boolean;
  /** いちばん新しい入金日(YYYY-MM-DD) */
  paidDate: string | null;
}

export interface PayoutLine {
  key: string;
  /** 計上月(対象の初期費用の計上月) */
  month: string;
  kind: "agency" | "referral";
  /** 支払先(代理店名・紹介者名) */
  payee: string;
  customerName: string;
  /** 例: 取次型 50%（初期費用 ¥100,000） */
  detail: string;
  amount: number;
  paidAt: string | null;
}

export interface MonthSummary {
  month: string;
  initial: number;
  monthly: number;
  other: number;
  /** 売上(税抜) */
  sales: number;
  tax: number;
  /** 税込 */
  total: number;
  /** 代理店報酬・紹介謝礼 */
  payouts: number;
}

export interface CustomerRow {
  customerId: string;
  customerName: string;
  customerCode: string;
  /** 月ごとの売上(税抜) */
  byMonth: Record<string, number>;
  total: number;
}

export interface RevenueLedger {
  fiscalYear: FiscalYear;
  months: MonthSummary[];
  totals: Omit<MonthSummary, "month">;
  customers: CustomerRow[];
  lines: RevenueLine[];
  payouts: PayoutLine[];
  /** この期に計上した請求書の未収(税込・請求書単位) */
  receivable: number;
  /** この期に計上した請求書のうち、入金済みの額(税込) */
  collected: number;
  /** 計上月が明細に入っておらず、発行月で数えた明細の数(確認用) */
  issueMonthFallbacks: number;
}

/** 明細ごとの消費税。請求書の税率ごとの消費税(四捨五入)を、端数の大きい明細から1円ずつ割り振る */
export function allocateLineTaxes(items: Pick<InvoiceItem, "quantity" | "unitPrice" | "taxRate">[]): number[] {
  const bases = items.map((it) => Math.round(it.quantity * it.unitPrice));
  const taxes = items.map(() => 0);
  const rates = [...new Set(items.map((it) => it.taxRate))];
  for (const rate of rates) {
    const idx = items.map((it, i) => (it.taxRate === rate ? i : -1)).filter((i) => i >= 0);
    const groupBase = idx.reduce((s, i) => s + bases[i], 0);
    const groupTax = Math.round(groupBase * rate);
    let assigned = 0;
    const fractions: { i: number; frac: number }[] = [];
    for (const i of idx) {
      const exact = bases[i] * rate;
      taxes[i] = Math.floor(exact);
      assigned += taxes[i];
      fractions.push({ i, frac: exact - taxes[i] });
    }
    let rest = groupTax - assigned;
    fractions.sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; rest > 0 && k < fractions.length; k++, rest--) taxes[fractions[k].i] += 1;
    // 四捨五入で合計が下がる(負の残り)ことは無いが、念のため後ろから戻す
    for (let k = fractions.length - 1; rest < 0 && k >= 0; k--, rest++) taxes[fractions[k].i] -= 1;
  }
  return taxes;
}

function kindOf(description: string, invoiceType: InvoiceType): RevenueKind {
  if (isInitialFeeLine(description)) return "initial";
  if (invoiceType === "recurring" || description.includes("月額")) return "monthly";
  return "other";
}

/** JST の日付 'YYYY-MM-DD'(日時でも日付でも受け付ける) */
function jstDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function buildRevenueLedger(params: {
  invoices: Invoice[];
  customers: Pick<Customer, "id" | "name" | "code">[];
  payments: Pick<Payment, "invoiceId" | "paidAt" | "status" | "deletedAt">[];
  commissions?: AgencyCommission[];
  referrals?: Referral[];
  agencies?: Pick<Agency, "id" | "name">[];
  endYear: number;
  endMonth: number;
  asOf?: Date;
}): RevenueLedger {
  const fy = fiscalYear(params.endYear, params.endMonth);
  const inYear = new Set(fy.months);
  const customers = new Map(params.customers.map((c) => [c.id, c]));

  const lastPaidAt = new Map<string, string>();
  for (const p of params.payments) {
    if (!p.invoiceId || p.deletedAt || p.status === "failed") continue;
    const date = jstDate(p.paidAt);
    const prev = lastPaidAt.get(p.invoiceId);
    if (!prev || date > prev) lastPaidAt.set(p.invoiceId, date);
  }

  const lines: RevenueLine[] = [];
  // 初期費用の計上月(代理店報酬・紹介謝礼の計上月に使う)
  const initialMonthByInvoice = new Map<string, string>();
  const initialMonthByCustomer = new Map<string, string>();
  const invoicesInYear = new Map<string, Invoice>();
  let issueMonthFallbacks = 0;

  for (const inv of params.invoices) {
    if (inv.status === "canceled" || inv.deletedAt) continue;
    const customer = customers.get(inv.customerId);
    if (!customer) continue; // 削除したお客様(テストデータなど)の請求書は数えない
    const status = effectiveStatus(inv, params.asOf);
    const taxes = allocateLineTaxes(inv.items);
    inv.items.forEach((item, i) => {
      const { month, source } = revenueMonthOf(item, inv);
      const kind = kindOf(item.description, inv.type);
      if (kind === "initial") {
        if (!initialMonthByInvoice.has(inv.id)) initialMonthByInvoice.set(inv.id, month);
        const prev = initialMonthByCustomer.get(inv.customerId);
        if (!prev || month < prev) initialMonthByCustomer.set(inv.customerId, month);
      }
      if (!inYear.has(month)) return;
      const amount = Math.round(item.quantity * item.unitPrice);
      if (source === "issue") issueMonthFallbacks += 1;
      invoicesInYear.set(inv.id, inv);
      lines.push({
        key: `${inv.id}:${i}`,
        month,
        monthSource: source,
        customerId: inv.customerId,
        customerName: customer.name,
        customerCode: customer.code,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceType: inv.type,
        issueDate: inv.issueDate,
        status,
        description: item.description,
        kind,
        taxRate: item.taxRate,
        amount,
        tax: taxes[i],
        total: amount + taxes[i],
        paid: status === "paid",
        paidDate: lastPaidAt.get(inv.id) ?? null,
      });
    });
  }
  lines.sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      a.customerCode.localeCompare(b.customerCode) ||
      a.invoiceNumber.localeCompare(b.invoiceNumber) ||
      a.key.localeCompare(b.key),
  );

  // 代理店報酬・紹介謝礼(対象の初期費用の計上月に並べる)
  const agencyNames = new Map((params.agencies ?? []).map((a) => [a.id, a.name]));
  const payouts: PayoutLine[] = [];
  for (const c of params.commissions ?? []) {
    const month =
      (c.invoiceId ? initialMonthByInvoice.get(c.invoiceId) : undefined) ??
      initialMonthByCustomer.get(c.customerId) ??
      jstDate(c.createdAt).slice(0, 7);
    if (!inYear.has(month)) continue;
    const rule = AGENCY_DEAL_TYPES[c.dealType];
    payouts.push({
      key: `agency:${c.id}`,
      month,
      kind: "agency",
      payee: agencyNames.get(c.agencyId) ?? "代理店",
      customerName: customers.get(c.customerId)?.name ?? "",
      detail: `${rule?.label ?? "代理店報酬"} ${Math.round(c.rate * 100)}%（初期費用 ¥${c.baseAmount.toLocaleString("ja-JP")}）`,
      amount: c.amount,
      paidAt: c.paidAt ? jstDate(c.paidAt) : null,
    });
  }
  for (const r of params.referrals ?? []) {
    if (r.rewardStatus !== "payable" && r.rewardStatus !== "paid") continue;
    if (r.rewardAmount <= 0 || !r.customerId) continue;
    const month =
      initialMonthByCustomer.get(r.customerId) ??
      jstDate(r.rewardPaidAt ?? r.submittedAt).slice(0, 7);
    if (!inYear.has(month)) continue;
    payouts.push({
      key: `referral:${r.id}`,
      month,
      kind: "referral",
      payee: r.referrerName || "ご紹介者",
      customerName: customers.get(r.customerId)?.name ?? "",
      detail: `紹介謝礼（初期費用 ¥${r.rewardBaseAmount.toLocaleString("ja-JP")} の25%）`,
      amount: r.rewardAmount,
      paidAt: r.rewardStatus === "paid" && r.rewardPaidAt ? jstDate(r.rewardPaidAt) : null,
    });
  }
  payouts.sort((a, b) => a.month.localeCompare(b.month) || a.key.localeCompare(b.key));

  const months: MonthSummary[] = fy.months.map((month) => {
    const ls = lines.filter((l) => l.month === month);
    const sum = (k: RevenueKind) => ls.filter((l) => l.kind === k).reduce((s, l) => s + l.amount, 0);
    const sales = ls.reduce((s, l) => s + l.amount, 0);
    const tax = ls.reduce((s, l) => s + l.tax, 0);
    return {
      month,
      initial: sum("initial"),
      monthly: sum("monthly"),
      other: sum("other"),
      sales,
      tax,
      total: sales + tax,
      payouts: payouts.filter((p) => p.month === month).reduce((s, p) => s + p.amount, 0),
    };
  });
  const totals = months.reduce(
    (t, m) => ({
      initial: t.initial + m.initial,
      monthly: t.monthly + m.monthly,
      other: t.other + m.other,
      sales: t.sales + m.sales,
      tax: t.tax + m.tax,
      total: t.total + m.total,
      payouts: t.payouts + m.payouts,
    }),
    { initial: 0, monthly: 0, other: 0, sales: 0, tax: 0, total: 0, payouts: 0 },
  );

  const byCustomer = new Map<string, CustomerRow>();
  for (const l of lines) {
    let row = byCustomer.get(l.customerId);
    if (!row) {
      row = { customerId: l.customerId, customerName: l.customerName, customerCode: l.customerCode, byMonth: {}, total: 0 };
      byCustomer.set(l.customerId, row);
    }
    row.byMonth[l.month] = (row.byMonth[l.month] ?? 0) + l.amount;
    row.total += l.amount;
  }
  const firstMonth = (r: CustomerRow) => fy.months.find((m) => (r.byMonth[m] ?? 0) !== 0) ?? fy.last;
  const customerRows = [...byCustomer.values()].sort(
    (a, b) => firstMonth(a).localeCompare(firstMonth(b)) || a.customerCode.localeCompare(b.customerCode),
  );

  let receivable = 0;
  let collected = 0;
  for (const inv of invoicesInYear.values()) {
    receivable += Math.max(0, inv.total - inv.amountPaid);
    collected += Math.min(inv.total, inv.amountPaid);
  }

  return {
    fiscalYear: fy,
    months,
    totals,
    customers: customerRows,
    lines,
    payouts,
    receivable,
    collected,
    issueMonthFallbacks,
  };
}
