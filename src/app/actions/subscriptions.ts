"use server";

import { revalidatePath } from "next/cache";
import { getServiceRepository } from "@/lib/data";
import type {
  PlanInput,
  SubscriptionInput,
  SubscriptionUpdateInput,
} from "@/lib/data/repository";
import type { Subscription } from "@/lib/domain/types";

export async function createSubscriptionAction(input: SubscriptionInput) {
  try {
    const repo = await getServiceRepository();
    await repo.createSubscription(input);
    revalidatePath("/subscriptions");
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateSubscriptionStatusAction(
  id: string,
  status: Subscription["status"],
) {
  try {
    const repo = await getServiceRepository();
    await repo.updateSubscriptionStatus(id, status);
    revalidatePath("/subscriptions");
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 定期契約の変更(オプション・個別価格)。次回の請求生成から反映される。 */
export async function updateSubscriptionAction(id: string, input: SubscriptionUpdateInput) {
  try {
    const repo = await getServiceRepository();
    await repo.updateSubscription(id, input);
    revalidatePath("/subscriptions");
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function createPlanAction(input: PlanInput) {
  try {
    const repo = await getServiceRepository();
    await repo.createPlan(input);
    revalidatePath("/subscriptions");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updatePlanAction(id: string, input: Partial<PlanInput>) {
  try {
    const repo = await getServiceRepository();
    await repo.updatePlan(id, input);
    revalidatePath("/subscriptions");
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
