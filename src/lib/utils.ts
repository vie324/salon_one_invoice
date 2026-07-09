import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind クラス結合ヘルパー */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 日本円フォーマット (¥1,234) */
export function formatJPY(amount: number, opts?: { sign?: boolean }): string {
  const sign = opts?.sign && amount > 0 ? "+" : "";
  return (
    sign +
    new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    }).format(amount)
  );
}

/** 数値を3桁区切り (通貨記号なし) */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("ja-JP").format(n);
}

/** グラフ軸などの省略表記 (¥12万, ¥1,050万) */
export function formatCompactJPY(n: number): string {
  if (n >= 10000) {
    const man = n / 10000;
    return `¥${man >= 100 ? Math.round(man).toLocaleString("ja-JP") : man.toFixed(man % 1 === 0 ? 0 : 1)}万`;
  }
  return formatJPY(n);
}

/** 日付を YYYY/MM/DD 表記 */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** 年月表記 (2026年7月) */
export function formatYearMonth(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(d);
}

/** ISO 日付 (YYYY-MM-DD) を返す (時刻切り捨て) */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 相対的な残日数 → 表示文字列。負なら「N日超過」。 */
export function daysUntil(dateStr: string, from = new Date()): number {
  const due = new Date(dateStr);
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const target = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

/** 口座番号などのマスキング (末尾4桁のみ表示) */
export function maskAccount(value: string | null | undefined): string {
  if (!value) return "—";
  const v = value.replace(/\s/g, "");
  if (v.length <= 4) return v;
  return "••••" + v.slice(-4);
}

/** パーセンテージ整形 */
export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** 簡易ID生成 (デモデータ用。crypto.randomUUID があれば利用) */
export function genId(prefix = "id"): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${rnd.replace(/-/g, "").slice(0, 12)}`;
}
