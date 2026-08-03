import type {
  Agency,
  AgencyMember,
  Customer,
  InvoiceWithCustomer,
} from "./types";

/** 支払明細の1行(対象月の請求書1件に対応) */
export interface AgencyStatementLine {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  memberId: string | null;
  memberName: string;
  issueDate: string;
  /** 税抜金額 */
  subtotal: number;
  /** 税込金額 */
  total: number;
  /** 入金済みか(入金済みの売上のみ支払対象) */
  paid: boolean;
  status: InvoiceWithCustomer["status"];
}

/** 営業マン別の集計 */
export interface AgencyMemberSummary {
  memberId: string | null;
  memberName: string;
  customerCount: number;
  invoicedSubtotal: number;
  paidSubtotal: number;
  commission: number;
}

export interface AgencyStatement {
  agency: Agency;
  month: string; // YYYY-MM
  lines: AgencyStatementLine[];
  members: AgencyMemberSummary[];
  /** 対象月の請求合計(税抜) */
  invoicedSubtotal: number;
  /** 入金済み売上(税抜) = 支払対象 */
  paidSubtotal: number;
  /** 支払額 = 入金済み売上(税抜) × 手数料率 */
  commission: number;
}

/**
 * 代理店の月次支払明細を計算する(純粋関数)。
 * - 対象: 代理店に紐付く顧客の、対象月の請求書(billingPeriod が対象月、
 *   なければ発行日が対象月。下書き・取消は除外)
 * - 支払額: 入金済み請求書の税抜合計 × 手数料率(円未満四捨五入)
 * - 未入金の請求は明細に「未入金(対象外)」として表示し、入金後の月の
 *   再計算で支払対象に含まれる…ではなく、対象月の集計はその時点の入金状況で
 *   確定させる運用(確認期間後に発行する)を想定する。
 */
export function computeAgencyStatement(input: {
  agency: Agency;
  members: AgencyMember[];
  customers: Customer[];
  invoices: InvoiceWithCustomer[];
  month: string;
}): AgencyStatement {
  const { agency, members, customers, invoices, month } = input;
  const attributed = customers.filter((c) => c.agencyId === agency.id);
  const customerIds = new Set(attributed.map((c) => c.id));
  const memberById = new Map(members.map((m) => [m.id, m]));

  const lines: AgencyStatementLine[] = invoices
    .filter((inv) => {
      if (!customerIds.has(inv.customerId)) return false;
      if (inv.status === "draft" || inv.status === "canceled") return false;
      const period = inv.billingPeriod ?? inv.issueDate.slice(0, 7);
      return period === month;
    })
    .map((inv) => {
      const customer = attributed.find((c) => c.id === inv.customerId);
      const member = customer?.agencyMemberId
        ? memberById.get(customer.agencyMemberId)
        : undefined;
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        customerName: inv.customer?.name ?? customer?.name ?? "",
        memberId: member?.id ?? null,
        memberName: member?.name ?? "（担当なし）",
        issueDate: inv.issueDate,
        subtotal: inv.subtotal,
        total: inv.total,
        paid: inv.status === "paid",
        status: inv.status,
      };
    })
    .sort((a, b) => a.memberName.localeCompare(b.memberName) || a.invoiceNumber.localeCompare(b.invoiceNumber));

  const invoicedSubtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const paidSubtotal = lines.filter((l) => l.paid).reduce((s, l) => s + l.subtotal, 0);
  const commission = Math.round(paidSubtotal * agency.commissionRate);

  // 営業マン別集計
  const byMember = new Map<string, AgencyMemberSummary>();
  for (const line of lines) {
    const key = line.memberId ?? "__none__";
    const cur =
      byMember.get(key) ??
      ({
        memberId: line.memberId,
        memberName: line.memberName,
        customerCount: 0,
        invoicedSubtotal: 0,
        paidSubtotal: 0,
        commission: 0,
      } satisfies AgencyMemberSummary);
    cur.invoicedSubtotal += line.subtotal;
    if (line.paid) cur.paidSubtotal += line.subtotal;
    byMember.set(key, cur);
  }
  // 顧客数(重複なし)
  for (const [key, summary] of byMember) {
    const ids = new Set(
      lines.filter((l) => (l.memberId ?? "__none__") === key).map((l) => l.customerId),
    );
    summary.customerCount = ids.size;
    summary.commission = Math.round(summary.paidSubtotal * agency.commissionRate);
  }

  return {
    agency,
    month,
    lines,
    members: [...byMember.values()],
    invoicedSubtotal,
    paidSubtotal,
    commission,
  };
}
