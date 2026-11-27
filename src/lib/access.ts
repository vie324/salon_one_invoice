import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import type { Role } from "@/lib/domain/types";

/**
 * 印刷ページ・CSV など、画面のメニューを通らずに開ける場所の権限チェック。
 * middleware ではログインだけを確かめているので、役割はここで確かめる
 * (税理士さん(閲覧のみ)のアカウントに、口座情報や契約書を見せないため)。
 */

/** ページ用。権限が無ければ「見つかりません」にする(存在するかどうかも見せない) */
export async function requirePageAccess(allowed: (roles: Role[]) => boolean): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !allowed(user.roles)) notFound();
  return user;
}

/** ルートハンドラー(CSV)用。権限が無ければ 403 の応答を返す */
export async function forbiddenUnless(
  allowed: (roles: Role[]) => boolean,
): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("ログインしてください", { status: 401 });
  if (!allowed(user.roles)) return new NextResponse("この操作の権限がありません", { status: 403 });
  return null;
}

/** generateMetadata 用。権限があるか(無ければ汎用のタイトルにする) */
export async function hasAccess(allowed: (roles: Role[]) => boolean): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user && allowed(user.roles);
}
