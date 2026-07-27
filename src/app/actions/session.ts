"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEMO_ROLE_COOKIE } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

/** デモで選べるアカウント(admin2 は2人目のプロダクト管理者)。旧ロール値も許容。 */
const DEMO_PERSONA_VALUES = ["admin", "admin2", "billing", "dev", "owner", "staff"] as const;
export type DemoPersona = (typeof DEMO_PERSONA_VALUES)[number];

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * デモモードのログイン / アカウント切替。
 * cookie にどのデモアカウントかを記録し、これがログイン状態そのものになる
 * (cookie が無ければ未ログインとして扱われ、ログイン画面へ送られる)。
 */
export async function switchDemoRole(persona: string) {
  if (!isDemoMode) return { ok: false as const, error: "デモモードではありません" };
  if (!DEMO_PERSONA_VALUES.includes(persona as DemoPersona)) {
    return { ok: false as const, error: "不正なアカウントです" };
  }
  const store = await cookies();
  store.set(DEMO_ROLE_COOKIE, persona, {
    path: "/",
    maxAge: THIRTY_DAYS,
    httpOnly: true,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
