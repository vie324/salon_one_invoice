"use server";

import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/data";

function revalidateDdViews() {
  revalidatePath("/direct-debit");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/payments");
}

export async function createBatchAction(scheduledDate: string) {
  try {
    const repo = await getRepository();
    const batch = await repo.createBatchFromAwaiting(scheduledDate);
    revalidateDdViews();
    return { ok: true as const, id: batch.id, count: batch.items.length };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function processBatchAction(id: string) {
  try {
    const repo = await getRepository();
    const batch = await repo.processBatch(id);
    const success = batch.items.filter((i) => i.result === "success").length;
    const failed = batch.items.filter((i) => i.result === "failed").length;
    revalidateDdViews();
    revalidatePath(`/direct-debit/${id}`);
    return { ok: true as const, success, failed };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
