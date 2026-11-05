import type { BadgeTone } from "./constants";
import type { MarketingService, MarketingServiceStatus } from "./types";
import { formatJPY } from "@/lib/utils";

/**
 * マーケティング代行の料金と表示(純粋関数)。
 *
 * 料金は契約書の料金表【マーケティング代行費用】に合わせる:
 *   初期構築費用 … 通常料金 100,000円(特別プラン料金 50,000円)
 *   月額運用費   … 30,000円、または運用費(広告費等)の20%相当額のいずれか高い方
 * 広告費等の媒体費用そのものは、これとは別に実費をお客様へ請求する(契約書 第5条7項)。
 */

/** 通常料金(新規登録の初期値) */
export const MARKETING_DEFAULTS = {
  initialFee: 100_000,
  monthlyMinimum: 30_000,
  feeRate: 0.2,
} as const;

/** 特別プラン料金の初期構築費用(登録画面で選べるようにする) */
export const MARKETING_SPECIAL_INITIAL_FEE = 50_000;

export const MARKETING_STATUSES: MarketingServiceStatus[] = ["planned", "active", "stopped"];

export const marketingStatusLabels: Record<MarketingServiceStatus, string> = {
  planned: "開始前",
  active: "運用中",
  stopped: "停止",
};

export const marketingStatusTone: Record<MarketingServiceStatus, BadgeTone> = {
  planned: "info",
  active: "success",
  stopped: "neutral",
};

/** 停止していない(開始前・運用中)か */
export function isMarketingLive(service: Pick<MarketingService, "status"> | null | undefined): boolean {
  return Boolean(service && service.status !== "stopped");
}

/** 料率の表示(0.2 → "20%") */
export function formatFeeRate(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

/**
 * ある月の月額運用費(税抜)。最低額と「広告費等 × 料率」の高い方。
 * 料率 0 は固定額(最低額のみ)。
 */
export function marketingMonthlyFee(
  service: Pick<MarketingService, "monthlyMinimum" | "feeRate">,
  adSpend: number,
): number {
  const byRate = Math.round(Math.max(0, adSpend) * Math.max(0, service.feeRate));
  return Math.max(service.monthlyMinimum, byRate);
}

/**
 * 広告費等がこの額を超えると「広告費 × 料率」のほうが最低額より高くなる(月額が最低額から増え始める)。
 * 料率 0(固定額)は null。
 */
export function marketingBreakEvenAdSpend(
  service: Pick<MarketingService, "monthlyMinimum" | "feeRate">,
): number | null {
  if (service.feeRate <= 0) return null;
  return Math.ceil(service.monthlyMinimum / service.feeRate);
}

/** 月額運用費の条件を1行で(例: 「¥30,000〜（広告費の20%が上回る月はその額）」) */
export function marketingFeeSummary(service: Pick<MarketingService, "monthlyMinimum" | "feeRate">): string {
  if (service.feeRate <= 0) return formatJPY(service.monthlyMinimum);
  return `${formatJPY(service.monthlyMinimum)}〜（広告費の${formatFeeRate(service.feeRate)}が上回る月はその額）`;
}
