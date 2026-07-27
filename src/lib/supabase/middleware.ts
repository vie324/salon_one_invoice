import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/config";

/** 認証不要で開けるパス(ログイン画面・決済の戻り先・トークンで保護された署名ページ) */
function isPublicPath(path: string): boolean {
  return (
    isAuthPath(path) ||
    path.startsWith("/billing") ||
    path.startsWith("/sign") // 電子契約の署名ページ(トークンで保護)
  );
  // /print(顧客情報を含む印刷ページ)と /api/direct-debit(口座情報CSV)は
  // スタッフ専用のため認証ゲートの対象。公開したままだと、データ取得の
  // 認証判定に失敗した際に偽の 404 になるうえ、情報漏えいの恐れもある。
}

function isAuthPath(path: string): boolean {
  return path.startsWith("/login") || path.startsWith("/auth");
}

function toLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  const path = request.nextUrl.pathname;
  url.pathname = "/login";
  // ログイン後に元のページへ戻すため、開こうとしたパスを引き継ぐ
  url.search = path === "/" ? "" : `?redirect=${encodeURIComponent(path)}`;
  return NextResponse.redirect(url);
}

function toApp(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}

/**
 * セッション更新 + 認証ガード。
 * URL を開いた時点でログイン状態を確認し、未ログインならログイン画面へ送る。
 * ゲスト(匿名)での閲覧はできない — デモモードでもデモアカウントでのログインが必要。
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // デモモード(Supabase未設定)は cookie に記録したデモアカウントで判定する
  if (!isSupabaseConfigured) {
    const loggedIn = Boolean(request.cookies.get("demo_role")?.value);
    if (!loggedIn && !isPublicPath(path)) return toLogin(request);
    if (loggedIn && isAuthPath(path)) return toApp(request);
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
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

  if (!user && !isPublicPath(path)) return toLogin(request);
  // ログイン済みでログイン画面を開いたら、種別に応じた入口(/)へ送る
  if (user && isAuthPath(path)) return toApp(request);

  return response;
}
