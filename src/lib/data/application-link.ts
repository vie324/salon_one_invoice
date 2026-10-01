import { normalizeStoreCount } from "@/lib/domain/calculations";
import { normalizeOverride } from "@/lib/domain/pricing";
import type { ApplicationLink } from "@/lib/domain/types";
import type { ApplicationLinkInput } from "./repository";

export type ApplicationLinkSettings = Pick<
  ApplicationLink,
  | "withContract"
  | "planId"
  | "optionKeys"
  | "storeCount"
  | "initialFeeOverride"
  | "monthlyPriceOverride"
  | "agencyId"
  | "agencyMemberId"
  | "agencyDealType"
  | "referralId"
  | "allowInquiry"
>;

/**
 * 申込・契約URLの設定値をそろえる(デモ・本番で共通)。
 * 代理店を外したのに営業マン・区分だけ残る、といった食い違いをここで防ぐ。
 */
export function applicationLinkSettings(input: ApplicationLinkInput): ApplicationLinkSettings {
  const agencyId = input.agencyId || null;
  return {
    withContract: Boolean(input.withContract),
    planId: input.planId || null,
    optionKeys: [...new Set(input.optionKeys ?? [])],
    storeCount:
      input.storeCount === null || input.storeCount === undefined
        ? null
        : normalizeStoreCount(input.storeCount),
    initialFeeOverride: normalizeOverride(input.initialFeeOverride),
    monthlyPriceOverride: normalizeOverride(input.monthlyPriceOverride),
    agencyId,
    agencyMemberId: agencyId ? input.agencyMemberId || null : null,
    agencyDealType: agencyId ? (input.agencyDealType ?? null) : null,
    referralId: input.referralId || null,
    // 「まずは相談したい」の入口は代理店の申込＋契約URLだけ(発行画面でもその場合だけ選べる)
    allowInquiry: Boolean(input.allowInquiry) && agencyId !== null && Boolean(input.withContract),
  };
}
