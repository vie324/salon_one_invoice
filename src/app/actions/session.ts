"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEMO_ROLE_COOKIE } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

/** デモで切替可能なペルソナ(admin2 は2人目のプロダクト管理者)。旧ロール値も許容。 */
const DEMO_PERSONA_VALUES = ["admin", "admin2", "billing", "dev", "owner", "staff"] as const;
export type DemoPersona = (typeof DEMO_PERSONA_VALUES)[number];

/** デモモードのアカウントを切り替える(全体管理者×2/請求管理/開発進捗)。 */
export async function switchDemoRole(persona: string) {
  if (!isDemoMode) return;
  if (!DEMO_PERSONA_VALUES.includes(persona as DemoPersona)) return;
  const store = await cookies();
  store.set(DEMO_ROLE_COOKIE, persona, { path: "/", maxAge: 60 * 60 * 24 * 30 });
  revalidatePath("/", "layout");
}
