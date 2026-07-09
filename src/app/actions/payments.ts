"use server";

import { revalidatePath } from "next/cache";
import { parseBankCsv } from "@/lib/bank/csv";
import { getRepository } from "@/lib/data";
import type { PaymentInput } from "@/lib/data/repository";

function revalidatePaymentViews() {
  revalidatePath("/payments");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

export async function recordPaymentAction(input: PaymentInput) {
  try {
    const repo = await getRepository();
    await repo.recordPayment(input);
    revalidatePaymentViews();
    if (input.invoiceId) revalidatePath(`/invoices/${input.invoiceId}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function importBankCsvAction(csvText: string) {
  try {
    const rows = parseBankCsv(csvText);
    if (rows.length === 0) {
      return { ok: false as const, error: "取り込める入金明細が見つかりませんでした（日付・金額の列をご確認ください）" };
    }
    const repo = await getRepository();
    const created = await repo.importBankTransactions(rows);
    revalidatePaymentViews();
    return { ok: true as const, count: created.length };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function matchBankTransactionAction(txnId: string, invoiceId: string) {
  try {
    const repo = await getRepository();
    await repo.matchBankTransaction(txnId, invoiceId);
    revalidatePaymentViews();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
