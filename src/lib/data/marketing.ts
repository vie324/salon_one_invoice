import { MARKETING_DEFAULTS, MARKETING_STATUSES } from "@/lib/domain/marketing";
import type { MarketingService } from "@/lib/domain/types";
import { toJstDateKey } from "@/lib/utils";
import type { MarketingServiceInput } from "./repository";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateOrNull(value: string | null | undefined, label: string): string | null {
  if (value == null || value === "") return null;
  if (!DATE_RE.test(value)) throw new Error(`${label}の日付が正しくありません`);
  return value;
}

function amount(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label}は0円以上で入力してください`);
  return Math.round(value);
}

/**
 * マーケティング代行の登録・更新内容を、既存の記録に重ねて検証する(デモ/Supabase 共通)。
 * - 新規登録で省略した金額は契約書の料金表(通常料金)の値
 * - 「運用中」にしたのに開始日が無ければ今日、「停止」にしたのに停止日が無ければ今日を入れる
 * - 停止から運用中・開始前に戻したら停止日は消す
 */
export function mergeMarketingService(
  existing: MarketingService | null,
  customerId: string,
  input: MarketingServiceInput,
  today: string = toJstDateKey(new Date().toISOString()),
): Omit<MarketingService, "id" | "createdAt" | "updatedAt"> {
  const next: Omit<MarketingService, "id" | "createdAt" | "updatedAt"> = {
    customerId,
    status: existing?.status ?? "planned",
    appliedOn: existing?.appliedOn ?? today,
    startedOn: existing?.startedOn ?? null,
    endedOn: existing?.endedOn ?? null,
    initialFee: existing?.initialFee ?? MARKETING_DEFAULTS.initialFee,
    monthlyMinimum: existing?.monthlyMinimum ?? MARKETING_DEFAULTS.monthlyMinimum,
    feeRate: existing?.feeRate ?? MARKETING_DEFAULTS.feeRate,
    note: existing?.note ?? "",
  };

  if (input.status !== undefined) {
    if (!MARKETING_STATUSES.includes(input.status)) throw new Error("状態が正しくありません");
    next.status = input.status;
  }
  if (input.appliedOn !== undefined) next.appliedOn = dateOrNull(input.appliedOn, "申込日");
  if (input.startedOn !== undefined) next.startedOn = dateOrNull(input.startedOn, "開始日");
  if (input.endedOn !== undefined) next.endedOn = dateOrNull(input.endedOn, "停止日");
  if (input.initialFee !== undefined) next.initialFee = amount(input.initialFee, "初期構築費用");
  if (input.monthlyMinimum !== undefined) {
    next.monthlyMinimum = amount(input.monthlyMinimum, "月額運用費（最低額）");
  }
  if (input.feeRate !== undefined) {
    if (!Number.isFinite(input.feeRate) || input.feeRate < 0 || input.feeRate > 1) {
      throw new Error("広告費に対する料率は0〜100%で入力してください");
    }
    next.feeRate = Math.round(input.feeRate * 10000) / 10000;
  }
  if (input.note !== undefined) next.note = input.note.trim();

  if (next.status === "active" && !next.startedOn) next.startedOn = today;
  if (next.status === "stopped" && !next.endedOn) next.endedOn = today;
  if (next.status !== "stopped") next.endedOn = null;
  if (next.startedOn && next.endedOn && next.endedOn < next.startedOn) {
    throw new Error("停止日は開始日より後の日付にしてください");
  }
  return next;
}
