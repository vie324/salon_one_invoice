"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { BatchResultInput } from "@/lib/data/repository";
import { canAccessBilling } from "@/lib/domain/constants";

/**
 * NSS 引き落とし(毎月の口座振替)の操作。
 *   ① 引き落としの一覧を作る(NSS 登録済みのお客様の、入金待ちの請求)
 *   ② NSS の収納サイトへ金額を登録したら「NSS登録済」にする
 *   ③ 引き落とし日のあと、NSS の結果(成功/失敗)を1件ずつ反映する
 */

function revalidateDdViews(id?: string) {
  revalidatePath("/direct-debit");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/payments");
  revalidatePath("/orders");
  revalidatePath("/home");
  if (id) revalidatePath(`/direct-debit/${id}`);
}

async function requireDebitUser() {
  const user = await requireActionUser();
  if (!canAccessBilling(user.roles)) throw new Error("NSS引き落としへのアクセス権限がありません");
  return user;
}

/** 引き落としの一覧を作る(invoiceIds を省略すると対象の請求をすべて) */
export async function createBatchAction(scheduledDate: string, invoiceIds?: string[]) {
  try {
    await requireDebitUser();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) throw new Error("引き落とし日を指定してください");
    const repo = await getServiceRepository();
    const batch = await repo.createBatchFromAwaiting(scheduledDate, invoiceIds);
    revalidateDdViews();
    return { ok: true as const, id: batch.id, count: batch.items.length };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** NSS の収納サイトへ金額を登録したことを記録する */
export async function markBatchSubmittedAction(id: string) {
  try {
    const user = await requireDebitUser();
    const repo = await getServiceRepository();
    await repo.markBatchSubmitted(id, user.name);
    revalidateDdViews(id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * NSS から返ってきた引き落とし結果を反映する。
 * 成功 = 入金を記録(引き落とし日付) / 失敗 = 請求を「引落失敗」にして要フォローへ。
 */
export async function recordBatchResultsAction(id: string, results: BatchResultInput[]) {
  try {
    const user = await requireDebitUser();
    if (results.length === 0) throw new Error("反映する結果がありません");
    const repo = await getServiceRepository();
    const batch = await repo.processBatch(id, results, user.name);
    const success = batch.items.filter((i) => i.result === "success").length;
    const failed = batch.items.filter((i) => i.result === "failed").length;
    revalidateDdViews(id);
    return { ok: true as const, success, failed };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * NSS の登録が終わっていない(引き落とせない)お客様の請求を、振込に切り替える。
 * 請求書の記載も「お振込先」の案内に変わる。続けて請求書を送付すること。
 */
export async function switchInvoicesToTransferAction(invoiceIds: string[]) {
  try {
    await requireDebitUser();
    if (invoiceIds.length === 0) throw new Error("対象の請求がありません");
    const repo = await getServiceRepository();
    const batches = await repo.listBatches();
    let count = 0;
    for (const id of invoiceIds) {
      const inBatch = batches.some((b) =>
        b.items.some((it) => it.invoiceId === id && it.result === "pending"),
      );
      if (inBatch) continue; // NSS へ登録済みの請求は二重請求を避けるため切り替えない
      await repo.updateInvoicePaymentMethod(id, "bank_transfer");
      count++;
    }
    revalidateDdViews();
    return { ok: true as const, count };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
