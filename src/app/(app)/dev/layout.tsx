import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessDev } from "@/lib/domain/constants";

/**
 * 開発進捗セクションのアクセスガード。
 * 「請求管理のみ」のアカウントは開発依頼を閲覧できないため /dashboard へ送る。
 */
export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!canAccessDev(user.role)) redirect("/dashboard");
  return <>{children}</>;
}
