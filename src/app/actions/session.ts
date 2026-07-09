"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEMO_ROLE_COOKIE } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import type { Role } from "@/lib/domain/types";

/** デモモードの表示ロールを切り替える(経営者/担当者/管理者)。 */
export async function switchDemoRole(role: Role) {
  if (!isDemoMode) return;
  const store = await cookies();
  store.set(DEMO_ROLE_COOKIE, role, { path: "/", maxAge: 60 * 60 * 24 * 30 });
  revalidatePath("/", "layout");
}
