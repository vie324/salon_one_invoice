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
 * デモモードでは cookie のロールに応じたデモアカウント(既定: 全体管理者)になりきる。
 * 本番では Supabase Auth のユーザー + profiles.role を用いる。
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  if (isDemoMode) {
    const { cookies } = await import("next/headers");
    const { getDemoProfile } = await import("@/lib/data/demo/store");
    const store = await cookies();
    const profile = getDemoProfile(store.get(DEMO_ROLE_COOKIE)?.value);
    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      demo: true,
    };
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Auth サーバーへの検証呼び出しが失敗する環境でも、cookie のセッションから
    // 表示用のユーザー情報を得る。呼び出し元は middleware で認証ゲート済みの
    // 画面・アクションのみのため、ここでは表示・記録(操作者名)用途に限られる。
    const {
      data: { session },
    } = await supabase.auth.getSession();
    user = session?.user ?? null;
  }
  if (!user) {
    return { id: "", name: "ゲスト", email: "", role: "staff", demo: false };
  }

  // profiles は RLS クライアントだと anon 扱いで読めない環境があるため、
  // サービスロールがあればそちらで参照する(自分のプロフィール表示のみ)。
  const { supabaseServiceKey } = await import("@/lib/config");
  let profileDb = supabase;
  if (supabaseServiceKey) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    profileDb = createAdminClient();
  }
  const { data: profile } = await profileDb
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
