import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessBilling, canAccessDev, homePathFor } from "@/lib/domain/constants";

/**
 * 開発進捗セクションのアクセスガード。
 * 「請求管理のみ」のアカウントは開発依頼を閲覧できないため /dashboard へ、
 * 税理士さん(閲覧のみ)のアカウントは売上台帳へ送る。
 */
export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!canAccessDev(user.roles)) redirect(canAccessBilling(user.roles) ? "/dashboard" : homePathFor(user.roles));
  return <>{children}</>;
}
