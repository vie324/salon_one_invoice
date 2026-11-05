"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { MarketingServiceInput } from "@/lib/data/repository";
import { canAccessBilling } from "@/lib/domain/constants";

/** マーケティング代行の登録・変更(お客様ごとに1件)。請求管理の権限が必要。 */
export async function saveMarketingServiceAction(customerId: string, input: MarketingServiceInput) {
  try {
    const user = await requireActionUser();
    if (!canAccessBilling(user.roles)) throw new Error("請求管理の権限がありません");
    const repo = await getServiceRepository();
    await repo.upsertMarketingService(customerId, input);
    revalidatePath("/signups");
    revalidatePath(`/customers/${customerId}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 間違えて登録したマーケティング代行の取り消し。請求管理の権限が必要。 */
export async function deleteMarketingServiceAction(customerId: string) {
  try {
    const user = await requireActionUser();
    if (!canAccessBilling(user.roles)) throw new Error("請求管理の権限がありません");
    const repo = await getServiceRepository();
    await repo.deleteMarketingService(customerId);
    revalidatePath("/signups");
    revalidatePath(`/customers/${customerId}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
