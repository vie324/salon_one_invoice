"use server";

import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/config";

export async function signOutAction() {
  if (isDemoMode) redirect("/login");
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
