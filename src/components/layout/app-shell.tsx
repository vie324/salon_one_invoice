"use client";

import {
  Banknote,
  ClipboardList,
  FileSignature,
  FileText,
  Handshake,
  Home,
  Inbox,
  LayoutDashboard,
  Landmark,
  LifeBuoy,
  Menu,
  MoreHorizontal,
  Repeat,
  Settings,
  SquareKanban,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { DemoRoleSwitcher } from "@/components/layout/demo-role-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import type { CurrentUser } from "@/lib/auth";
import { canAccessBilling, canAccessDev, roleLabels } from "@/lib/domain/constants";
import type { AppNotification } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** 役割に関係なく全員に出す入口。売上・開発の進捗を1画面にまとめたホーム。 */
const homeNav = { href: "/home", label: "進捗ホーム", icon: Home } as const;

const billingNav = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/pipeline", label: "顧客ステータス", icon: SquareKanban },
  { href: "/applications", label: "申込", icon: Inbox },
  { href: "/contracts", label: "契約書", icon: FileSignature },
  { href: "/invoices", label: "請求書", icon: FileText },
  { href: "/customers", label: "顧客", icon: Users },
  { href: "/ltv", label: "LTV分析", icon: TrendingUp },
  { href: "/agencies", label: "代理店", icon: Handshake },
  { href: "/subscriptions", label: "定期請求", icon: Repeat },
  { href: "/direct-debit", label: "口座振替", icon: Landmark },
  { href: "/payments", label: "入金確認", icon: Wallet },
  { href: "/trash", label: "ゴミ箱", icon: Trash2 },
  { href: "/help", label: "ヘルプ", icon: LifeBuoy },
] as const;

const devNav = [{ href: "/dev", label: "開発進捗", icon: ClipboardList }] as const;

const settingsNav = { href: "/settings", label: "設定", icon: Settings } as const;

type NavItem = { href: string; label: string; icon: React.ElementType };

/**
 * スマホ下部タブに出す 4件。役割ごとに「毎日使うもの」を選ぶ。
 * 5件目は必ず「メニュー」(ドロワーを開く)。
 */
function bottomTabsFor(showBilling: boolean, showDev: boolean): NavItem[] {
  if (showBilling && showDev) {
    return [
      { href: "/home", label: "ホーム", icon: Home },
      { href: "/invoices", label: "請求書", icon: FileText },
      { href: "/customers", label: "顧客", icon: Users },
      { href: "/dev", label: "開発進捗", icon: ClipboardList },
    ];
  }
  if (showDev) {
    return [
      { href: "/home", label: "ホーム", icon: Home },
      { href: "/dev", label: "開発進捗", icon: ClipboardList },
      { href: "/dev?category=bug", label: "不具合", icon: LifeBuoy },
      { href: "/settings", label: "設定", icon: Settings },
    ];
  }
  return [
    { href: "/home", label: "ホーム", icon: Home },
    { href: "/invoices", label: "請求書", icon: FileText },
    { href: "/customers", label: "顧客", icon: Users },
    { href: "/payments", label: "入金", icon: Wallet },
  ];
}

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
  // ドロワーを指で左へ払って閉じるための移動量
  const [dragX, setDragX] = React.useState(0);
  const dragStart = React.useRef<number | null>(null);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ドロワーを開いている間は背面をスクロールさせない + Escape で閉じる
  React.useEffect(() => {
    if (!open) {
      setDragX(0);
      return;
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const isActive = (href: string) => {
    const path = href.split("?")[0];
    return pathname === path || pathname.startsWith(path + "/");
  };

  const showBilling = canAccessBilling(user.roles);
  const showDev = canAccessDev(user.roles);
  const tagline = showBilling && showDev
    ? "請求・開発進捗の管理"
    : showDev
      ? "開発進捗管理"
      : "請求・入金管理";

  // ヘッダーに出す「いまどこにいるか」(スマホはサイドバーが見えないため)
  const allNav: NavItem[] = [homeNav, ...billingNav, ...devNav, settingsNav];
  const currentLabel = allNav.find((n) => isActive(n.href))?.label ?? "ホーム";

  const bottomTabs = bottomTabsFor(showBilling, showDev);

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 text-sm transition-colors",
          // スマホでは指で押しやすい高さにする
          "h-11 lg:h-auto lg:py-2",
          active
            ? "bg-sidebar-accent/20 font-medium text-white"
            : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white active:bg-white/10",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
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
      <div className="px-5 pb-5 pt-[max(env(safe-area-inset-top),1.25rem)]">
        <Logo onDark markSize={34} />
        <div className="mt-1.5 pl-[44px] text-[11px] text-sidebar-muted">{tagline}</div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto scroll-contain px-3 py-2 scrollbar-thin">
        {renderItem(homeNav)}
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
        <div className="pt-1">{renderItem(settingsNav)}</div>
      </nav>

      <div className="border-t border-sidebar-border px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4">
        <div className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2.5">
          <Banknote className="h-4 w-4 shrink-0 text-sidebar-accent" />
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

      {/* モバイルドロワー(スライドイン / 左へ払って閉じる) */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="メニュー">
          <div
            className="absolute inset-0 animate-fade-in bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 w-[82vw] max-w-[17rem] animate-slide-in-left shadow-2xl"
            style={dragX ? { transform: `translateX(${-dragX}px)` } : undefined}
            onTouchStart={(e) => {
              dragStart.current = e.touches[0].clientX;
            }}
            onTouchMove={(e) => {
              if (dragStart.current === null) return;
              setDragX(Math.max(0, dragStart.current - e.touches[0].clientX));
            }}
            onTouchEnd={() => {
              if (dragX > 60) setOpen(false);
              dragStart.current = null;
              setDragX(0);
            }}
          >
            {sidebar}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="メニューを閉じる"
              className="absolute right-3 top-[max(env(safe-area-inset-top),0.75rem)] inline-flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-1.5 border-b border-border bg-background/85 px-2 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-4 lg:gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted active:bg-muted lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="メニューを開く"
            aria-expanded={open}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* スマホ: いま開いている画面名を出して迷子を防ぐ */}
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
            <LogoMark size={22} className="shrink-0" />
            <span className="truncate text-sm font-semibold">{currentLabel}</span>
          </div>
          <div className="hidden flex-1 lg:block" />

          {user.demo && <DemoRoleSwitcher currentId={user.id} />}
          <NotificationBell notifications={notifications} unreadCount={unreadCount} />
          <ThemeToggle />
          <div className="flex items-center gap-2.5 pl-0.5 lg:pl-1">
            <div className="hidden text-right lg:block">
              <div className="text-sm font-medium leading-tight">{user.name}</div>
              <div className="text-[11px] text-muted-foreground">{roleLabels[user.role]}</div>
            </div>
            <Link
              href="/settings"
              aria-label={`${user.name}（${roleLabels[user.role]}）の設定`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              {user.name.slice(0, 1)}
            </Link>
          </div>
        </header>

        {/* 下部タブバーの高さぶん、本文の下に余白を確保する */}
        <main className="min-w-0 flex-1 p-3 pb-[calc(4.25rem+env(safe-area-inset-bottom))] sm:p-6 lg:pb-6">
          {children}
        </main>
      </div>

      {/* モバイル下部タブバー — よく使う画面に1タップで移動する */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="メインメニュー"
      >
        <div className="flex items-stretch">
          {bottomTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors active:bg-muted",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} />
                <span className="truncate px-0.5">{tab.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors active:bg-muted"
            aria-label="すべてのメニューを開く"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>メニュー</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
