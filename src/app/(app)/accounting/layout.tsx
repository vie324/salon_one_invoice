import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canViewAccounting, homePathFor } from "@/lib/domain/constants";

/** 売上台帳のアクセスガード。請求管理の担当者と税理士さん(閲覧のみ)だけが見られる。 */
export default async function AccountingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!canViewAccounting(user.roles)) redirect(homePathFor(user.roles));
  return <>{children}</>;
}
