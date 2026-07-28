"use client";

import {
  Banknote,
  ClipboardList,
  FileSignature,
  FileText,
  Handshake,
  Inbox,
  LayoutDashboard,
  Landmark,
  LifeBuoy,
  Menu,
  Repeat,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Logo } from "@/components/brand/logo";
import { DemoRoleSwitcher } from "@/components/layout/demo-role-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import type { CurrentUser } from "@/lib/auth";
import { canAccessBilling, canAccessDev, roleLabels } from "@/lib/domain/constants";
import type { AppNotification } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const billingNav = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/applications", label: "申込", icon: Inbox },
  { href: "/contracts", label: "契約書", icon: FileSignature },
  { href: "/invoices", label: "請求書", icon: FileText },
  { href: "/customers", label: "顧客", icon: Users },
  { href: "/agencies", label: "代理店", icon: Handshake },
  { href: "/subscriptions", label: "定期請求", icon: Repeat },
  { href: "/direct-debit", label: "口座振替", icon: Landmark },
  { href: "/payments", label: "入金確認", icon: Wallet },
  { href: "/help", label: "ヘルプ", icon: LifeBuoy },
] as const;

const devNav = [{ href: "/dev", label: "開発進捗", icon: ClipboardList }] as const;

export function AppShell({
  user,
  notifications,
  unreadCount,
  children,
}: {
  user: CurrentUser;
  notifications: AppNotification[];
  unreadCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const showBilling = canAccessBilling(user.role);
  const showDev = canAccessDev(user.role);
  const tagline = showBilling && showDev
    ? "請求・開発進捗の管理"
    : showDev
      ? "開発進捗管理"
      : "請求・入金管理";

  const renderItem = (item: { href: string; label: string; icon: React.ElementType }) => {
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
  };

  const sectionLabel = (label: string) => (
    <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
      {label}
    </div>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-5">
        <Logo onDark markSize={34} />
        <div className="mt-1.5 pl-[44px] text-[11px] text-sidebar-muted">{tagline}</div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 scrollbar-thin">
        {showBilling && (
          <>
            {showDev && sectionLabel("請求管理")}
            {billingNav.map(renderItem)}
          </>
        )}
        {showDev && (
          <>
            {showBilling && sectionLabel("開発")}
            {devNav.map(renderItem)}
          </>
        )}
        <div className="pt-1">
          {renderItem({ href: "/settings", label: "設定", icon: Settings })}
        </div>
      </nav>

      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2.5">
          <Banknote className="h-4 w-4 text-sidebar-accent" />
          <div className="text-[11px] leading-tight text-sidebar-muted">
            <div className="font-medium text-sidebar-foreground">
              {showBilling ? "引き落とし対応" : "Salon One 開発"}
            </div>
            {showBilling ? "口座振替＋入金確認" : "依頼・不具合を一元管理"}
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

          {user.demo && <DemoRoleSwitcher currentId={user.id} />}
          <NotificationBell notifications={notifications} unreadCount={unreadCount} />
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
