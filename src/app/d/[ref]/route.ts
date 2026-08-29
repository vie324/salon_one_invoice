import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { canAccessDev } from "@/lib/domain/constants";

/**
 * 開発進捗の短縮リンク。
 *
 *   /d/12                       → /dev/<依頼のID>
 *   /d/709b10f2-911b-...        → /dev/709b10f2-911b-...
 *
 * 依頼番号(#12)だけで開けるので、LINE や口頭でも渡しやすい。
 * 未ログインの場合は middleware がログイン画面へ送り、ログイン後にここへ戻る。
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const value = decodeURIComponent(ref ?? "").trim().replace(/^#/, "");
  const origin = request.nextUrl.origin;

  // 二重の安全弁: middleware を通っていない経路でも未ログインは通さない
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?redirect=${encodeURIComponent(`/d/${value}`)}`, origin),
    );
  }

  // 開発進捗を見られない役割は、詳細を引き当てずに請求側の入口へ返す
  if (!canAccessDev(user.roles)) return NextResponse.redirect(new URL("/dashboard", origin));

  if (!value) return NextResponse.redirect(new URL("/dev", origin));

  // 数字なら依頼番号。それ以外は ID とみなしてそのまま詳細へ。
  if (!/^\d+$/.test(value)) {
    return NextResponse.redirect(new URL(`/dev/${encodeURIComponent(value)}`, origin));
  }

  const issueNumber = Number(value);
  try {
    const repo = await getServiceRepository();
    const issues = await repo.listDevIssues();
    const hit = issues.find((i) => i.issueNumber === issueNumber);
    if (hit) return NextResponse.redirect(new URL(`/dev/${hit.id}`, origin));
  } catch {
    /* 取得に失敗したときは一覧へ逃がす(下へ) */
  }
  // 見つからない番号は、探せるよう一覧の検索結果へ送る
  return NextResponse.redirect(new URL(`/dev?status=all&q=${issueNumber}`, origin));
}
