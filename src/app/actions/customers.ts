"use server";

import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/data";
import type { CustomerInput, MandateInput } from "@/lib/data/repository";

export async function createCustomerAction(input: CustomerInput) {
  try {
    const repo = await getRepository();
    const c = await repo.createCustomer(input);
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    return { ok: true as const, id: c.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 口座振替(マンデート)の登録・更新。NSS等の収納代行への登録完了をツール上に反映する。 */
export async function upsertMandateAction(customerId: string, input: MandateInput) {
  try {
    const repo = await getRepository();
    await repo.upsertMandate(customerId, input);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/direct-debit");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateCustomerAction(id: string, input: Partial<CustomerInput>) {
  try {
    const repo = await getRepository();
    await repo.updateCustomer(id, input);
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
