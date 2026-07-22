import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/config";

/**
 * セッション更新 + 認証ガード。
 * デモモード(Supabase未設定)では素通しし、誰でもアプリを閲覧できる。
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // デモモードは認証不要
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login") || path.startsWith("/auth");
  const isPublic =
    isAuthRoute ||
    path.startsWith("/billing") ||
    path.startsWith("/sign"); // 電子契約の署名ページ(トークンで保護)
  // /print(顧客情報を含む印刷ページ)と /api/direct-debit(口座情報CSV)は
  // スタッフ専用のため認証ゲートの対象。公開したままだと、データ取得の
  // 認証判定に失敗した際に偽の 404 になるうえ、情報漏えいの恐れもある。

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
