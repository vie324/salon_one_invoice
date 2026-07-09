import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return <AppShell user={user}>{children}</AppShell>;
}
