"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_ROLE_COOKIE } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

/** サインアウト。セッション(デモは cookie)を破棄してログイン画面へ戻す。 */
export async function signOutAction() {
  if (isDemoMode) {
    const store = await cookies();
    store.delete(DEMO_ROLE_COOKIE);
    redirect("/login");
  }
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
