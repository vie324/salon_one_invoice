import { computeOrderQuote, planDisplayName } from "@/lib/domain/pricing";
import type {
  Agency,
  AgencyMember,
  ApplicationLink,
  Plan,
  Referral,
} from "@/lib/domain/types";
import { formatJPY } from "@/lib/utils";

/** URL一覧に添える補足(プラン・料金・代理店・紹介) */
export interface LinkDetail {
  planName: string | null;
  priceLabel: string | null;
  agencyName: string | null;
  memberName: string | null;
  referralName: string | null;
}

export function linkDetails(
  links: ApplicationLink[],
  ctx: { plans: Plan[]; agencies: Agency[]; members: AgencyMember[]; referrals: Referral[] },
): Record<string, LinkDetail> {
  const out: Record<string, LinkDetail> = {};
  for (const link of links) {
    const plan = link.planId ? ctx.plans.find((p) => p.id === link.planId) : undefined;
    const quote = plan
      ? computeOrderQuote({
          plan,
          optionKeys: link.optionKeys,
          storeCount: link.storeCount ?? 1,
          initialFeeOverride: link.initialFeeOverride,
          monthlyPriceOverride: link.monthlyPriceOverride,
        })
      : null;
    const referral = link.referralId
      ? ctx.referrals.find((r) => r.id === link.referralId)
      : undefined;
    out[link.id] = {
      planName: plan ? planDisplayName(plan) : null,
      priceLabel: quote
        ? `初期 ${formatJPY(quote.initialFee)}・月 ${formatJPY(quote.monthlyTotal)}${
            link.storeCount ? `（${quote.storeCount}店舗）` : "〜（店舗数はお客様が入力）"
          }${quote.initialFeeOverridden || quote.monthlyOverridden ? "・個別価格" : ""}`
        : null,
      agencyName: link.agencyId
        ? (ctx.agencies.find((a) => a.id === link.agencyId)?.name ?? "（削除済みの代理店）")
        : null,
      memberName: link.agencyMemberId
        ? (ctx.members.find((m) => m.id === link.agencyMemberId)?.name ?? null)
        : null,
      referralName: referral ? referral.companyName || referral.contactName : null,
    };
  }
  return out;
}
