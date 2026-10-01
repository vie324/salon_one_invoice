import type { DirectDebitMandate } from "@/lib/domain/types";
import { toISODate } from "@/lib/utils";
import type { MandateInput } from "./repository";

/**
 * 口座振替(NSS)の手続き入力を、保存済みの状態へ反映した結果を返す(デモ・本番で共通)。
 *
 * - undefined の項目は変更しない(null を渡すと日付を消す)
 * - 「NSS登録済」にしたのに登録完了日が無ければ今日を入れる
 * - 口座番号などの口座情報は新たに受け付けない(消去のための空文字だけ反映する)
 */
export function mergeMandate(
  existing: DirectDebitMandate | null,
  customerId: string,
  input: MandateInput,
  today: string = toISODate(new Date()),
): Omit<DirectDebitMandate, "id"> {
  const base: Omit<DirectDebitMandate, "id"> = {
    customerId,
    bankName: existing?.bankName ?? "",
    branchName: existing?.branchName ?? "",
    branchCode: existing?.branchCode ?? "",
    accountType: existing?.accountType ?? "普通",
    accountNumber: existing?.accountNumber ?? "",
    accountHolderKana: existing?.accountHolderKana ?? "",
    status: existing?.status ?? "pending",
    registeredAt: existing?.registeredAt ?? null,
    formSentOn: existing?.formSentOn ?? null,
    formReceivedOn: existing?.formReceivedOn ?? null,
    nssSubmittedOn: existing?.nssSubmittedOn ?? null,
    debitStartMonth: existing?.debitStartMonth ?? null,
    nssCustomerNumber: existing?.nssCustomerNumber ?? "",
    note: existing?.note ?? "",
  };
  const next = { ...base };
  if (input.status !== undefined) next.status = input.status;
  if (input.registeredAt !== undefined) next.registeredAt = input.registeredAt;
  if (input.formSentOn !== undefined) next.formSentOn = input.formSentOn;
  if (input.formReceivedOn !== undefined) next.formReceivedOn = input.formReceivedOn;
  if (input.nssSubmittedOn !== undefined) next.nssSubmittedOn = input.nssSubmittedOn;
  if (input.debitStartMonth !== undefined) next.debitStartMonth = input.debitStartMonth || null;
  if (input.nssCustomerNumber !== undefined) next.nssCustomerNumber = input.nssCustomerNumber.trim();
  if (input.note !== undefined) next.note = input.note;
  // 旧運用の口座情報は「消去」だけを受け付ける
  for (const key of [
    "bankName",
    "branchName",
    "branchCode",
    "accountNumber",
    "accountHolderKana",
  ] as const) {
    if (input[key] === "") next[key] = "";
  }
  if (next.status === "active" && !next.registeredAt) next.registeredAt = today;
  if (next.status !== "active" && input.status !== undefined && input.registeredAt === undefined) {
    // 登録済みから戻した(不備・停止)ときは、登録完了日を消して再登録を待つ
    if (base.status === "active" && next.status === "pending") next.registeredAt = null;
  }
  return next;
}

/** 旧運用の口座情報が残っているか(消去ボタンの表示に使う) */
export function hasLegacyBankInfo(m: Pick<DirectDebitMandate, "bankName" | "accountNumber" | "accountHolderKana"> | null): boolean {
  return Boolean(m && (m.bankName || m.accountNumber || m.accountHolderKana));
}
