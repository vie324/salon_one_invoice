import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canAccessBilling } from "@/lib/domain/constants";

export const dynamic = "force-dynamic";

/** トップ。アカウント種別に応じて請求管理 / 開発進捗へ振り分ける。 */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(canAccessBilling(user.role) ? "/dashboard" : "/dev");
}
