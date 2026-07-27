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
     * - 画像等の静的アセット
     * /api/direct-debit(口座情報CSV)はスタッフ専用のため認証ゲートを通す。
     */
    "/((?!api/stripe|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
