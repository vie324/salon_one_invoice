import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 次を除く全パスにマッチ:
     * - api (Webhook/Cron/CSV は各ルートで独自に認証するため middleware を通さない)
     * - _next/static, _next/image, favicon
     * - 画像等の静的アセット
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
