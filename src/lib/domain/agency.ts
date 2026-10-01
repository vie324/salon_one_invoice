import { effectiveStatus } from "./calculations";
import { AGENCY_DEAL_TYPES } from "./constants";
import type {
  Agency,
  AgencyCommission,
  AgencyCommissionStatus,
  AgencyDealType,
  AgencyMember,
  Customer,
  Invoice,
} from "./types";

/**
 * 代理店報酬の計算(純粋関数)。
 *
 * 報酬 = お客様の初期費用(税抜) × 区分ごとの率
 *   - 取次型:          50%
 *   - 営業・初期設定型: 100%
 *
 * 金額は受注確定(初回請求書の作成)の時点で確定して記録し、
 * お客様の初期費用の入金を確認した時点で「支払対象」になる。
 * 支払明細は「その月に支払対象になった報酬」をまとめたもの。
 */

/** 区分の報酬率 */
export function agencyCommissionRate(dealType: AgencyDealType): number {
  return AGENCY_DEAL_TYPES[dealType]?.initialFeeRate ?? 0;
}

/** 報酬額 = 初期費用(税抜) × 率(円未満四捨五入)。初期費用が0なら0。 */
export function agencyCommissionAmount(baseAmount: number, dealType: AgencyDealType): number {
  if (!baseAmount || baseAmount <= 0) return 0;
  return Math.round(baseAmount * agencyCommissionRate(dealType));
}

/** 「初期費用の50%」のような表記 */
export function agencyRateLabel(dealType: AgencyDealType): string {
  return `初期費用の${Math.round(agencyCommissionRate(dealType) * 100)}%`;
}

/** 案件に適用する区分(案件ごとの指定 → 代理店の既定 → 取次型) */
export function resolveDealType(
  customer: Pick<Customer, "agencyDealType"> | null | undefined,
  agency: Pick<Agency, "defaultDealType"> | null | undefined,
): AgencyDealType {
  return customer?.agencyDealType ?? agency?.defaultDealType ?? "referral";
}

type InvoiceLike = Pick<
  Invoice,
  "id" | "invoiceNumber" | "status" | "total" | "amountPaid" | "dueDate" | "paidAt" | "issueDate"
>;

/** 報酬の状況(初回請求の入金状況から導出する) */
export function commissionStatus(
  commission: Pick<AgencyCommission, "paidAt" | "invoiceId">,
  invoice: InvoiceLike | null | undefined,
): AgencyCommissionStatus {
  if (commission.paidAt) return "paid";
  if (!commission.invoiceId) return "payable";
  if (!invoice) return "void";
  const status = effectiveStatus(invoice);
  if (status === "canceled") return "void";
  return status === "paid" ? "payable" : "pending";
}

/** 支払対象になった日(= 初期費用の入金を確認した日) */
export function commissionConfirmedOn(
  commission: Pick<AgencyCommission, "invoiceId" | "createdAt">,
  invoice: InvoiceLike | null | undefined,
): string | null {
  if (!commission.invoiceId) return commission.createdAt.slice(0, 10);
  if (!invoice || effectiveStatus(invoice) !== "paid") return null;
  return (invoice.paidAt ?? invoice.issueDate).slice(0, 10);
}

/** 支払明細・一覧の1行 */
export interface AgencyCommissionLine {
  commission: AgencyCommission;
  status: AgencyCommissionStatus;
  customerName: string;
  memberName: string;
  invoiceNumber: string | null;
  /** 支払対象になった日(初期費用の入金日) */
  confirmedOn: string | null;
}

/** 営業マン別の集計 */
export interface AgencyMemberSummary {
  memberId: string | null;
  memberName: string;
  count: number;
  total: number;
}

export interface AgencyStatement {
  agency: Agency;
  /** 対象月 (YYYY-MM) = 初期費用の入金を確認した月 */
  month: string;
  /** 対象月に支払対象になった報酬 */
  lines: AgencyCommissionLine[];
  members: AgencyMemberSummary[];
  /** 対象月の報酬合計 */
  total: number;
  /** うち支払済み */
  paidTotal: number;
  /** うち未払い */
  unpaidTotal: number;
}

/** 報酬1件を表示用の行にする */
export function toCommissionLine(
  commission: AgencyCommission,
  ctx: { customers: Customer[]; members: AgencyMember[]; invoices: InvoiceLike[] },
): AgencyCommissionLine {
  const invoice = commission.invoiceId
    ? (ctx.invoices.find((i) => i.id === commission.invoiceId) ?? null)
    : null;
  const member = commission.agencyMemberId
    ? ctx.members.find((m) => m.id === commission.agencyMemberId)
    : undefined;
  return {
    commission,
    status: commissionStatus(commission, invoice),
    customerName: ctx.customers.find((c) => c.id === commission.customerId)?.name ?? "（削除済みの顧客）",
    memberName: member?.name ?? "（担当なし）",
    invoiceNumber: invoice?.invoiceNumber ?? null,
    confirmedOn: commissionConfirmedOn(commission, invoice),
  };
}

/** 代理店の報酬を全件、表示用の行にする(新しい順) */
export function agencyCommissionLines(input: {
  agency: Pick<Agency, "id">;
  commissions: AgencyCommission[];
  customers: Customer[];
  members: AgencyMember[];
  invoices: InvoiceLike[];
}): AgencyCommissionLine[] {
  return input.commissions
    .filter((c) => c.agencyId === input.agency.id)
    .map((c) => toCommissionLine(c, input))
    .sort((a, b) => b.commission.createdAt.localeCompare(a.commission.createdAt));
}

/**
 * 月次の支払明細を計算する。
 * 対象月 = 初期費用の入金を確認した月。取消された請求の報酬は対象外。
 */
export function computeAgencyStatement(input: {
  agency: Agency;
  members: AgencyMember[];
  customers: Customer[];
  invoices: InvoiceLike[];
  commissions: AgencyCommission[];
  month: string;
}): AgencyStatement {
  const lines = agencyCommissionLines(input)
    .filter((l) => (l.status === "payable" || l.status === "paid") && l.confirmedOn?.slice(0, 7) === input.month)
    .sort(
      (a, b) =>
        a.memberName.localeCompare(b.memberName) ||
        (a.confirmedOn ?? "").localeCompare(b.confirmedOn ?? ""),
    );

  const byMember = new Map<string, AgencyMemberSummary>();
  for (const line of lines) {
    const key = line.commission.agencyMemberId ?? "__none__";
    const cur = byMember.get(key) ?? {
      memberId: line.commission.agencyMemberId,
      memberName: line.memberName,
      count: 0,
      total: 0,
    };
    cur.count += 1;
    cur.total += line.commission.amount;
    byMember.set(key, cur);
  }

  const total = lines.reduce((s, l) => s + l.commission.amount, 0);
  const paidTotal = lines
    .filter((l) => l.status === "paid")
    .reduce((s, l) => s + l.commission.amount, 0);
  return {
    agency: input.agency,
    month: input.month,
    lines,
    members: [...byMember.values()],
    total,
    paidTotal,
    unpaidTotal: total - paidTotal,
  };
}

/** 代理店ごとの集計(一覧画面用) */
export interface AgencySummary {
  /** 支払対象で未払いの報酬(月をまたいで合計) */
  unpaidTotal: number;
  unpaidCount: number;
  /** 初期費用の入金待ち(まだ確定していない)報酬 */
  pendingTotal: number;
  pendingCount: number;
  /** これまでに支払った報酬 */
  paidTotal: number;
}

export function summarizeAgencyCommissions(lines: AgencyCommissionLine[]): AgencySummary {
  const sum = (status: AgencyCommissionStatus) =>
    lines.filter((l) => l.status === status).reduce((s, l) => s + l.commission.amount, 0);
  const count = (status: AgencyCommissionStatus) => lines.filter((l) => l.status === status).length;
  return {
    unpaidTotal: sum("payable"),
    unpaidCount: count("payable"),
    pendingTotal: sum("pending"),
    pendingCount: count("pending"),
    paidTotal: sum("paid"),
  };
}
