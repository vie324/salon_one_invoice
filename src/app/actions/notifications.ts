"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";

/** 指定した通知(省略時は全通知)を既読にする。 */
export async function markNotificationsReadAction(ids?: string[]) {
  try {
    const user = await requireActionUser();
    const repo = await getServiceRepository();
    await repo.markNotificationsRead(user.id, ids);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
