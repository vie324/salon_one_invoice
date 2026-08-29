"use client";

import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * モーダル。
 * スマホでは画面下から出るボトムシートとして表示し、
 * 上部のハンドルを下へスワイプすると閉じられる(親指だけで操作できる)。
 * PC では従来どおり中央のダイアログ。
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [dragY, setDragY] = React.useState(0);
  const dragStart = React.useRef<number | null>(null);

  // onClose は呼び出し側でインライン定義されることが多く、入力のたびに
  // 関数の同一性が変わる。スクロール固定の副作用が再実行されて画面が
  // 跳ねないよう、最新の onClose は ref 経由で参照する。
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    // 背面のページがスクロールしないように固定する(iOS のスクロール貫通対策)
    const { body } = document;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  React.useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  if (!open) return null;

  // ボトムシートのスワイプ操作(ハンドル部分でのみ受け付ける)
  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.touches[0].clientY - dragStart.current));
  };
  const onTouchEnd = () => {
    if (dragY > 90) onClose();
    dragStart.current = null;
    setDragY(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        className={cn(
          "relative z-10 w-full max-w-lg animate-slide-up rounded-t-2xl border border-border bg-card shadow-xl sm:animate-fade-in sm:rounded-xl",
          "max-h-[92vh] overflow-y-auto scroll-contain scrollbar-thin sm:max-h-[90vh]",
          "pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:pb-0",
          className,
        )}
      >
        {/* スマホ用のドラッグハンドル */}
        <div
          className="sticky top-0 z-10 flex touch-none justify-center bg-card pb-1 pt-2.5 sm:hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-hidden
        >
          <span className="h-1.5 w-10 rounded-full bg-border" />
        </div>

        <div className="flex items-start justify-between gap-4 border-b border-border p-4 sm:p-5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
