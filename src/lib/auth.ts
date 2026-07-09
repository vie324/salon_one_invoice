import { cookies } from "next/headers";
import { isDemoMode } from "@/lib/config";
import type { Role } from "@/lib/domain/types";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  demo: boolean;
}

const DEMO_ROLE_COOKIE = "demo_role";

/**
 * 現在のユーザーを取得。
 * デモモードでは cookie のロール(既定 owner)を用いる。
 * 本番では Supabase Auth のユーザー + profiles.role を用いる。
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  if (isDemoMode) {
    const store = await cookies();
    const role = (store.get(DEMO_ROLE_COOKIE)?.value as Role) || "owner";
    return {
      id: "demo-user",
      name: role === "staff" ? "田村 彩（担当者）" : role === "admin" ? "管理者" : "佐々木 涼（経営者）",
      email: "demo@salon-one.example.jp",
      role,
      demo: true,
    };
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { id: "", name: "ゲスト", email: "", role: "staff", demo: false };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    name: profile?.full_name || user.email || "ユーザー",
    email: user.email ?? "",
    role: (profile?.role as Role) || "staff",
    demo: false,
  };
}

export { DEMO_ROLE_COOKIE };
