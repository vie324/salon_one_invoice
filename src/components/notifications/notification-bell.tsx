"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { markNotificationsReadAction } from "@/app/actions/notifications";
import { Badge } from "@/components/ui/badge";
import { notificationTypeLabels, notificationTypeTone } from "@/lib/domain/constants";
import type { AppNotification } from "@/lib/domain/types";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * ヘッダーの通知ベル。未読数バッジ + ドロップダウンで最近の通知を表示する。
 * 通知はサーバー(レイアウト)から渡され、既読化後に refresh で再取得する。
 */
export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: AppNotification[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const markAll = () =>
    startTransition(async () => {
      await markNotificationsReadAction();
      router.refresh();
    });

  const openItem = (n: AppNotification) => {
    setOpen(false);
    startTransition(async () => {
      if (!n.read) await markNotificationsReadAction([n.id]);
      router.refresh();
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`通知 (未読${unreadCount}件)`}
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted sm:h-9 sm:w-9"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* スマホでは画面幅いっぱいのシートにして、端で見切れないようにする */}
          <div className="fixed inset-x-2 top-[calc(env(safe-area-inset-top)+3.5rem)] z-50 overflow-hidden rounded-lg border border-border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[380px]">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-sm font-semibold">通知</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  disabled={pending}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  すべて既読にする
                </button>
              )}
            </div>
            <div className="max-h-[65vh] overflow-y-auto scroll-contain scrollbar-thin">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  通知はまだありません
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {notifications.map((n) => {
                    const inner = (
                      <div
                        className={cn(
                          "flex gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                          !n.read && "bg-primary/[0.04]",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            n.read ? "bg-transparent" : "bg-primary",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge tone={notificationTypeTone[n.type]}>
                              {notificationTypeLabels[n.type]}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {formatDateTime(n.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-snug">{n.message}</p>
                        </div>
                      </div>
                    );
                    return (
                      <li key={n.id}>
                        {n.issueId ? (
                          <Link href={`/dev/${n.issueId}`} onClick={() => openItem(n)} className="block">
                            {inner}
                          </Link>
                        ) : (
                          <button type="button" onClick={() => openItem(n)} className="block w-full">
                            {inner}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
