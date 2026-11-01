import { lineAmount } from "./calculations";
import type { Contract, Invoice } from "./types";

/**
 * お客様ごとの初期費用(純粋関数)。申込一覧で使う。
 */

/** 初回請求書の明細のうち、初期費用の行か(受注確定・請求を開始は「初期構築費用」で作る) */
function isInitialFeeLine(description: string): boolean {
  return description.startsWith("初期");
}

/**
 * 顧客ごとの初期費用(税抜)。
 * 実際に請求した額を優先する(取消以外でいちばん新しい初回請求書の「初期構築費用」の行)。
 * 初回請求書が無い場合(初期費用0円・システム外で請求など)は、締結済み契約書の初期費用を使う。
 */
export function initialFeesByCustomer(
  invoices: Pick<Invoice, "customerId" | "type" | "status" | "issueDate" | "items">[],
  contracts: Pick<Contract, "customerId" | "status" | "signedAt" | "terms">[],
): Map<string, number> {
  const fees = new Map<string, number>();

  const signed = contracts
    .filter((c) => c.status === "signed" && c.terms.initialFee != null)
    .sort((a, b) => (a.signedAt ?? "").localeCompare(b.signedAt ?? ""));
  for (const c of signed) fees.set(c.customerId, c.terms.initialFee as number);

  const initialInvoices = invoices
    .filter((i) => i.type === "initial" && i.status !== "canceled")
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  for (const inv of initialInvoices) {
    const lines = inv.items.filter((item) => isInitialFeeLine(item.description));
    if (lines.length === 0) continue;
    fees.set(inv.customerId, lines.reduce((s, item) => s + lineAmount(item), 0));
  }
  return fees;
}
