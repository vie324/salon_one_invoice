import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canAccessBilling, canAccessDev, homePathFor } from "@/lib/domain/constants";

/**
 * 請求管理セクションのアクセスガード。
 * 「開発進捗のみ」のアカウントは請求データを閲覧できないため /dev へ、
 * 税理士さん(閲覧のみ)のアカウントは売上台帳へ送る。
 */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!canAccessBilling(user.roles)) redirect(canAccessDev(user.roles) ? "/dev" : homePathFor(user.roles));
  return <>{children}</>;
}
