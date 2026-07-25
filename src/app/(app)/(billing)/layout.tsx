import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessBilling } from "@/lib/domain/constants";

/**
 * 請求管理セクションのアクセスガード。
 * 「開発進捗のみ」のアカウントは請求データを閲覧できないため /dev へ送る。
 */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!canAccessBilling(user.role)) redirect("/dev");
  return <>{children}</>;
}
