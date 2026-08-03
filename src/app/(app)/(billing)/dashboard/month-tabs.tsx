import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { addMonths, cn, formatMonthKey } from "@/lib/utils";

/** タブに並べる月数（選択月を含む直近Nヶ月） */
const SPAN = 12;

/** 月タブのリンク先。当月は素の /dashboard にする。 */
function monthHref(month: string, current: string): string {
  return month === current ? "/dashboard" : `/dashboard?month=${month}`;
}

/**
 * ダッシュボードの月切替タブ。
 * 直近 12ヶ月をタブで並べ、それより前の月は「前月」ボタンで遡る
 * （遡った月が起点になり、タブの並びもその月から 12ヶ月になる）。
 */
export function MonthTabs({ month, current }: { month: string; current: string }) {
  // 選択月が直近12ヶ月から外れている場合は、選択月を起点にタブを並べ替える
  const anchor = month < addMonths(current, -(SPAN - 1)) ? month : current;
  const months = Array.from({ length: SPAN }, (_, i) => addMonths(anchor, -i));
  const isCurrent = month === current;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        role="tablist"
        aria-label="表示する月"
      >
        {months.map((m) => {
          const active = m === month;
          return (
            <Link
              key={m}
              href={monthHref(m, current)}
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {formatMonthKey(m, { short: true })}
              {m === current && (
                <span className={cn("ml-1", active ? "opacity-80" : "opacity-70")}>(今月)</span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href={monthHref(addMonths(month, -1), current)}
          aria-label="前の月"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        {isCurrent ? (
          // 当月より先の月は集計対象が無いため進めない
          <span
            aria-disabled
            className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-border text-muted-foreground/40"
          >
            <ChevronRight className="h-4 w-4" />
          </span>
        ) : (
          <Link
            href={monthHref(addMonths(month, 1), current)}
            aria-label="次の月"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
        {!isCurrent && (
          <Link
            href="/dashboard"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            今月へ
          </Link>
        )}
      </div>
    </div>
  );
}
