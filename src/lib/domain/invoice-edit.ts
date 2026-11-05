import type { Invoice } from "./types";

/**
 * 請求書の明細の修正(純粋関数)。
 *
 * 修正できるのは入金前の請求書だけ。NSS引き落としの一覧に入っている請求書は、
 * NSS へ登録した金額と食い違わないよう、一覧から外すまで修正できない。
 */
export function invoiceEditBlockedReason(
  invoice: Pick<Invoice, "status" | "amountPaid">,
  inDirectDebitList: boolean,
): string | null {
  if (invoice.status === "canceled") return "取り消した請求書は修正できません";
  if (invoice.status === "paid" || invoice.status === "partially_paid" || invoice.amountPaid > 0) {
    return "入金済み（一部入金を含む）の請求書は修正できません";
  }
  if (inDirectDebitList) {
    return "NSS引き落としの一覧に入っている請求書は修正できません（一覧をゴミ箱へ移してから修正してください）";
  }
  return null;
}
