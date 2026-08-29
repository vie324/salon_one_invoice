import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 次を除く全パスにマッチ:
     * - api/stripe, api/cron (Webhook/Cron は署名・シークレットで独自に認証)
     * - _next/static, _next/image, favicon
     * - manifest.webmanifest / apple-icon (PWA の manifest とアイコン。
     *   ブラウザが認証情報なしで取得することがあり、ログインへ飛ばすと
     *   「ホーム画面に追加」が正しく動かない。中身に個人情報は含まない)
     * - 画像等の静的アセット
     * /api/direct-debit(口座情報CSV)はスタッフ専用のため認証ゲートを通す。
     */
    "/((?!api/stripe|api/cron|_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
