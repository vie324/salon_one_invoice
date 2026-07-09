"use server";

import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/data";
import type { PlanInput, SubscriptionInput } from "@/lib/data/repository";
import type { Subscription } from "@/lib/domain/types";

export async function createSubscriptionAction(input: SubscriptionInput) {
  try {
    const repo = await getRepository();
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
    const repo = await getRepository();
    await repo.updateSubscriptionStatus(id, status);
    revalidatePath("/subscriptions");
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function createPlanAction(input: PlanInput) {
  try {
    const repo = await getRepository();
    await repo.createPlan(input);
    revalidatePath("/subscriptions");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
