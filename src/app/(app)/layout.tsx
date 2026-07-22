import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth";

// 業務データは常に最新をDBから読む。静的プリレンダリングやルートキャッシュに
// ビルド時のデータが焼き込まれると、実在するデータの詳細ページが 404 になる。
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return <AppShell user={user}>{children}</AppShell>;
}
