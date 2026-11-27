import type { Repository } from "@/lib/data/repository";
import { buildRevenueLedger, fiscalYearEndYearOf, type RevenueLedger } from "@/lib/domain/revenue";
import type { Organization } from "@/lib/domain/types";
import { toISODate } from "@/lib/utils";

/**
 * 売上台帳(税理士さん向けのページ・印刷・CSV)のデータを読む。
 * fy は決算の年(2027 = 2027年6月期など)。未指定・不正値は今日が入る期。
 * 読むだけ(閲覧専用のアカウントでも使える get / list だけを呼ぶ)。
 */
export async function loadRevenueLedger(
  repo: Repository,
  fy?: string | null,
): Promise<{ org: Organization; ledger: RevenueLedger; currentEndYear: number }> {
  const org = await repo.getOrganization();
  const endMonth = org.fiscalYearEndMonth;
  // 「今日」は日本時間で決める(月末の夜に前の期を出さないように)
  const todayJst = toISODate(new Date(Date.now() + 9 * 3600 * 1000));
  const currentEndYear = fiscalYearEndYearOf(todayJst.slice(0, 7), endMonth);
  const requested = Number(fy);
  const endYear =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : currentEndYear;

  const [invoices, customers, payments, commissions, referrals, agencies] = await Promise.all([
    repo.listInvoices(),
    repo.listCustomers(),
    repo.listPayments(),
    // 代理店(0023)・紹介(0022)の更新が未適用の DB でも台帳は開けるようにする
    repo.listAgencyCommissions().catch(() => []),
    repo.listReferrals({ status: "all" }).catch(() => []),
    repo.listAgencies().catch(() => []),
  ]);

  const ledger = buildRevenueLedger({
    invoices,
    customers,
    payments,
    commissions,
    referrals,
    agencies,
    endYear,
    endMonth,
  });
  return { org, ledger, currentEndYear };
}
