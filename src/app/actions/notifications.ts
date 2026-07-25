"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";

/** 指定した通知(省略時は全通知)を既読にする。 */
export async function markNotificationsReadAction(ids?: string[]) {
  try {
    const user = await getCurrentUser();
    if (!user.id) throw new Error("ログインが必要です");
    const repo = await getServiceRepository();
    await repo.markNotificationsRead(user.id, ids);
    revalidatePath("/", "layout");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
