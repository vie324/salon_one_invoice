import type { Repository } from "@/lib/data/repository";
import { initialFeeOfItems } from "@/lib/domain/client-pricing";
import { referralReward } from "@/lib/domain/referral";
import type { Invoice } from "@/lib/domain/types";
import { formatJPY } from "@/lib/utils";

/**
 * 初回請求書(区分「初期費用」)の初期費用を直したときに、その初期費用から計算している
 * 代理店報酬(初期費用 × 区分の率)と紹介謝礼(初期費用の25%)を新しい金額に合わせる。
 * 支払済みのものは変えない(変えなかったことを説明として返す)。
 *
 * 戻り値は画面に出す説明(変えたもの・変えなかったもの)。
 */
export async function syncPayoutsWithInitialInvoice(
  repo: Repository,
  invoice: Pick<Invoice, "id" | "type" | "customerId" | "items">,
): Promise<string[]> {
  if (invoice.type !== "initial") return [];
  const fee = initialFeeOfItems(invoice.items);
  const notes: string[] = [];

  const commissions = (await repo.listAgencyCommissions({ customerId: invoice.customerId })).filter(
    (c) => c.invoiceId === invoice.id && c.baseAmount !== fee,
  );
  for (const c of commissions) {
    // 直す前の金額は先に控える(記録を書き換えたあとに読むと新しい金額になっていることがある)
    const before = c.amount;
    if (c.paidAt) {
      notes.push(`代理店報酬は支払済みのため ${formatJPY(before)} のままです（差額は代理店の画面で調整してください）`);
      continue;
    }
    const updated = await repo.updateAgencyCommissionBase(c.id, fee);
    notes.push(`代理店報酬を ${formatJPY(before)} → ${formatJPY(updated.amount)} に直しました`);
  }

  const referral = await repo.findReferralByCustomerId(invoice.customerId);
  if (referral && !referral.agencyId && referral.rewardBaseAmount !== fee) {
    const before = referral.rewardAmount;
    if (referral.rewardStatus === "payable") {
      const amount = referralReward(fee);
      await repo.setReferralReward(referral.id, {
        rewardBaseAmount: fee,
        rewardAmount: amount,
        status: fee > 0 ? "payable" : "pending",
      });
      notes.push(`ご紹介者へのお支払いを ${formatJPY(before)} → ${formatJPY(amount)} に直しました`);
    } else if (referral.rewardStatus === "paid") {
      notes.push(`ご紹介者へのお支払いは支払済みのため ${formatJPY(before)} のままです`);
    }
  }
  return notes;
}
