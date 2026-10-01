import { effectiveStatus, outstandingAmount } from "./calculations";
import { NSS_CONFIRMATION_DAYS, NSS_DEFAULT_DEBIT_DAY } from "./constants";
import type {
  DirectDebitBatch,
  DirectDebitMandate,
  InvoiceWithCustomer,
} from "./types";
import { addMonths, toISODate } from "@/lib/utils";

/**
 * NSS(日本システム収納)での口座振替の判定(純粋関数)。
 *
 * このツールの役割は「NSS の外でしか分からないこと」の管理に絞っている:
 *   - 誰の口座振替が NSS に登録済みか(依頼書の郵送〜登録完了)
 *   - 今月 NSS に登録する金額の一覧(引き落とせる請求 / 引き落とせない請求)
 *   - NSS から返ってきた結果(成功 = 入金 / 失敗 = 要フォロー)の請求への反映
 * 口座番号などの口座情報は NSS で管理し、このツールでは持たない。
 */

/** 請求の対象月(定期請求は請求期間、それ以外は引き落とし予定日の月) */
export function invoiceDebitMonth(inv: Pick<InvoiceWithCustomer, "billingPeriod" | "dueDate">): string {
  return inv.billingPeriod ?? inv.dueDate.slice(0, 7);
}

/** その月の引き落とし日(既定は27日。月末が短い月は末日) */
export function debitDateFor(month: string, day = NSS_DEFAULT_DEBIT_DAY): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return toISODate(new Date(y, m - 1, Math.min(day, last)));
}

/** 画面を開いたときに見る月(引き落とし日を過ぎていれば翌月) */
export function defaultDebitMonth(now = new Date()): string {
  const month = toISODate(now).slice(0, 7);
  return toISODate(now) > debitDateFor(month) ? addMonths(month, 1) : month;
}

/** 口座振替(NSS)の手続きの段階(一覧表示用) */
export type NssStage =
  | "not_started"
  | "form_sent"
  | "form_received"
  | "submitted"
  | "active"
  | "failed"
  | "revoked";

export const nssStageLabels: Record<NssStage, string> = {
  not_started: "未着手（依頼書の郵送待ち）",
  form_sent: "依頼書を郵送済み（返送待ち）",
  form_received: "依頼書を回収済み（NSSへ登録待ち）",
  submitted: "NSSへ登録済み（完了待ち）",
  active: "登録完了（引き落とし可）",
  failed: "不備あり（再提出）",
  revoked: "停止・解約",
};

export function nssStage(m: DirectDebitMandate | null): NssStage {
  if (!m) return "not_started";
  if (m.status === "active") return "active";
  if (m.status === "failed") return "failed";
  if (m.status === "revoked") return "revoked";
  if (m.nssSubmittedOn) return "submitted";
  if (m.formReceivedOn) return "form_received";
  if (m.formSentOn) return "form_sent";
  return "not_started";
}

/** 引き落としの対象かどうかの判定結果 */
export interface DebitCandidate {
  invoice: InvoiceWithCustomer;
  mandate: DirectDebitMandate | null;
  month: string;
  /** 残額(引き落とす金額) */
  amount: number;
  /** 引き落とせない理由(null = 引き落とせる) */
  blockedReason: string | null;
  /** 請求書の確認期間中(送付から日が浅い)なら、確認期間の終わり */
  confirmUntil: string | null;
}

/**
 * 口座振替の請求を「引き落とせる / 引き落とせない」に振り分ける。
 * 既に引き落としの一覧(結果待ち・成功)に入っている請求は除く。
 * month を指定すると、その月までの請求(過去の月の取り残しを含む)を対象にする。
 */
export function classifyDebitInvoices(input: {
  invoices: InvoiceWithCustomer[];
  mandates: DirectDebitMandate[];
  batches: DirectDebitBatch[];
  month: string;
  now?: Date;
}): { ready: DebitCandidate[]; blocked: DebitCandidate[]; failed: InvoiceWithCustomer[] } {
  const now = input.now ?? new Date();
  const inBatch = new Set(
    input.batches.flatMap((b) =>
      b.items.filter((i) => i.result !== "failed").map((i) => i.invoiceId),
    ),
  );
  const ready: DebitCandidate[] = [];
  const blocked: DebitCandidate[] = [];
  const failed: InvoiceWithCustomer[] = [];
  for (const inv of input.invoices) {
    if (inv.paymentMethod !== "direct_debit") continue;
    const status = effectiveStatus(inv, now);
    if (status === "failed") {
      failed.push(inv);
      continue;
    }
    if (!["awaiting_payment", "sent", "overdue", "partially_paid"].includes(status)) continue;
    if (outstandingAmount(inv) <= 0) continue;
    if (inBatch.has(inv.id)) continue;
    const month = invoiceDebitMonth(inv);
    if (month > input.month) continue;
    const mandate = input.mandates.find((m) => m.customerId === inv.customerId) ?? null;
    let blockedReason: string | null = null;
    if (!mandate || mandate.status !== "active") {
      blockedReason = mandate
        ? `口座振替が${nssStageLabels[nssStage(mandate)]}のため引き落とせません`
        : "口座振替の手続きがまだです（依頼書の郵送から）";
    } else if (mandate.debitStartMonth && month < mandate.debitStartMonth) {
      blockedReason = `振替開始月（${mandate.debitStartMonth.replace("-", "年")}月）より前の請求です`;
    }
    const sentOn = inv.issueDate;
    const confirmEnd = new Date(sentOn);
    confirmEnd.setDate(confirmEnd.getDate() + NSS_CONFIRMATION_DAYS);
    const confirmUntil = toISODate(confirmEnd) > toISODate(now) ? toISODate(confirmEnd) : null;
    const candidate: DebitCandidate = {
      invoice: inv,
      mandate,
      month,
      amount: outstandingAmount(inv),
      blockedReason,
      confirmUntil,
    };
    (blockedReason ? blocked : ready).push(candidate);
  }
  const byName = (a: DebitCandidate, b: DebitCandidate) =>
    a.month.localeCompare(b.month) || (a.invoice.customer?.code ?? "").localeCompare(b.invoice.customer?.code ?? "");
  return { ready: ready.sort(byName), blocked: blocked.sort(byName), failed };
}
