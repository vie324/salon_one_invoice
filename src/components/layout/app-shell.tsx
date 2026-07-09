"use client";

import {
  Banknote,
  FileText,
  LayoutDashboard,
  Landmark,
  Menu,
  Receipt,
  Repeat,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { switchDemoRole } from "@/app/actions/session";
import { ThemeToggle } from "@/components/theme-toggle";
import type { CurrentUser } from "@/lib/auth";
import { appName } from "@/lib/config";
import { roleLabels } from "@/lib/domain/constants";
import type { Role } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/invoices", label: "請求書", icon: FileText },
  { href: "/customers", label: "顧客", icon: Users },
  { href: "/subscriptions", label: "定期請求", icon: Repeat },
  { href: "/direct-debit", label: "口座振替", icon: Landmark },
  { href: "/payments", label: "入金確認", icon: Wallet },
  { href: "/settings", label: "設定", icon: Settings },
] as const;

export function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-accent text-white shadow">
          <Receipt className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">{appName}</div>
          <div className="text-[11px] text-sidebar-muted">請求・入金管理</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent/20 font-medium text-white"
                  : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2.5">
          <Banknote className="h-4 w-4 text-sidebar-accent" />
          <div className="text-[11px] leading-tight text-sidebar-muted">
            <div className="font-medium text-sidebar-foreground">引き落とし対応</div>
            口座振替＋入金確認
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* デスクトップ固定サイドバー */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-60">{sidebar}</div>
      </aside>

      {/* モバイルドロワー */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-60">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="メニュー"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex-1" />

          {user.demo && <RoleSwitcher role={user.role} />}
          <ThemeToggle />
          <div className="flex items-center gap-2.5 pl-1">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{user.name}</div>
              <div className="text-[11px] text-muted-foreground">{roleLabels[user.role]}</div>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
              {user.name.slice(0, 1)}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function RoleSwitcher({ role }: { role: Role }) {
  const [pending, start] = React.useTransition();
  return (
    <div className="hidden items-center gap-1 rounded-md border border-border bg-card p-0.5 sm:flex">
      {(["owner", "staff"] as Role[]).map((r) => (
        <button
          key={r}
          type="button"
          disabled={pending}
          onClick={() => start(() => switchDemoRole(r))}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            role === r
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {roleLabels[r]}表示
        </button>
      ))}
    </div>
  );
}
