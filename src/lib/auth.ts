import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/config";
import type { Role } from "@/lib/domain/types";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  demo: boolean;
}

/**
 * デモモードのログイン中アカウント(どのデモアカウントでログインしたか)。
 * 本番の Supabase セッションに相当する。未設定 = 未ログイン。
 */
const DEMO_ROLE_COOKIE = "demo_role";

/**
 * 現在のユーザーを取得。未ログインなら null。
 *
 * ゲスト(匿名)としてアプリを利用することはできない。認証が確認できない場合は
 * 必ず null を返し、呼び出し側(ページは requireUser、サーバーアクションは
 * requireActionUser)でログイン画面へ誘導する。
 *
 * デモモードでは cookie に記録したデモアカウントでログイン状態を表す。
 * 本番では Supabase Auth のユーザー + profiles.role を用いる。
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (isDemoMode) {
    const { cookies } = await import("next/headers");
    const { getDemoProfile } = await import("@/lib/data/demo/store");
    const store = await cookies();
    const persona = store.get(DEMO_ROLE_COOKIE)?.value;
    // cookie が無い = 未ログイン(デモでもログイン操作を必須にする)
    if (!persona) return null;
    const profile = getDemoProfile(persona);
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
    // ログイン中のユーザーを判定する(セッションが無ければ未ログイン)。
    const {
      data: { session },
    } = await supabase.auth.getSession();
    user = session?.user ?? null;
  }
  if (!user) return null;

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

/**
 * ページ・レイアウト用。未ログインならログイン画面へ送る。
 * (middleware でもゲートしているが、URL を直接開いた場合や
 * セッション失効直後にも確実にログイン状態を確認するための二重チェック)
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * サーバーアクション用。未ログインなら分かりやすいエラーを投げる。
 * (アクションは try/catch でエラー文言を画面へ返すため、redirect ではなく throw)
 */
export async function requireActionUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("ログインの有効期限が切れました。再度ログインしてください");
  }
  return user;
}

export { DEMO_ROLE_COOKIE };
