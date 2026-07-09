"use server";

import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/data";
import type { CustomerInput } from "@/lib/data/repository";

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
