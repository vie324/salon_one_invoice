import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { AppNotification } from "@/lib/domain/types";

// 業務データは常に最新をDBから読む。静的プリレンダリングやルートキャッシュに
// ビルド時のデータが焼き込まれると、実在するデータの詳細ページが 404 になる。
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // 通知(ヘッダーのベル)。取得失敗でアプリ全体を落とさない
  let notifications: AppNotification[] = [];
  let unreadCount = 0;
  if (user.id) {
    try {
      const repo = await getServiceRepository();
      [notifications, unreadCount] = await Promise.all([
        repo.listNotifications(user.id, { limit: 15 }),
        repo.countUnreadNotifications(user.id),
      ]);
    } catch {
      // 未マイグレーション環境などでは通知なしで表示する
    }
  }

  return (
    <AppShell user={user} notifications={notifications} unreadCount={unreadCount}>
      {children}
    </AppShell>
  );
}
