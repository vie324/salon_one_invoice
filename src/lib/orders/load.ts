import type { Repository } from "@/lib/data/repository";
import { resolveDealType } from "@/lib/domain/agency";
import { computeOrderProgress, type OrderProgress } from "@/lib/domain/onboarding";
import type {
  Agency,
  AgencyDealType,
  AgencyMember,
  Application,
  ContractWithCustomer,
  Customer,
  CustomerOnboarding,
  DirectDebitMandate,
  InvoiceWithCustomer,
  Plan,
  Referral,
  Subscription,
} from "@/lib/domain/types";
import { daysUntil } from "@/lib/utils";

/**
 * 受注管理の案件一覧(顧客1件 = 案件1件)を読み込む。
 *
 * 案件の進み具合(ステージ・チェック・次にやること)は、契約・請求・入金・NSS の
 * 実データから毎回計算する。保存しているステージが実データとずれていたら、
 * その場で実データ側に合わせて記録し直す(ステージ移動の履歴も残る)。
 * こうしておくと「カードを動かし忘れた」「チェックを付け忘れた」で進捗が
 * 実態とずれることがない。手で動かすのは「休止・解約・見送り」だけ。
 */

export interface OrderRow {
  card: CustomerOnboarding;
  customer: Customer;
  progress: OrderProgress;
  /** この顧客の申込(申込・契約URLから届いたもの。新しい順の先頭) */
  application: Application | null;
  /** この顧客の契約書(新しい順) */
  contracts: ContractWithCustomer[];
  invoices: InvoiceWithCustomer[];
  subscriptions: Subscription[];
  mandate: DirectDebitMandate | null;
  agency: Agency | null;
  agencyMember: AgencyMember | null;
  dealType: AgencyDealType | null;
  /** この顧客が「紹介された側」として登録された紹介(紹介者・代理店の問い合わせ) */
  referral: Referral | null;
  /** 今のステージに入ってからの日数 */
  daysInStage: number;
}

export interface OrderBook {
  rows: OrderRow[];
  /**
   * 「申込のみ」URLから届き、まだ顧客登録していない申込(古い順)。
   * 案件(顧客)になる前なので rows には入らないが、対応待ちとして扱う。
   */
  pendingApplications: Application[];
  plans: Plan[];
  agencies: Agency[];
  agencyMembers: AgencyMember[];
}

export async function loadOrderBook(
  repo: Repository,
  opts: { sync?: boolean; now?: Date } = {},
): Promise<OrderBook> {
  const now = opts.now ?? new Date();
  const [
    cards,
    customers,
    contracts,
    invoices,
    subscriptions,
    plans,
    mandates,
    applications,
    agencies,
    agencyMembers,
    referrals,
    batches,
  ] = await Promise.all([
    repo.listOnboardings(),
    repo.listCustomers(),
    repo.listContracts(),
    repo.listInvoices(),
    repo.listSubscriptions(),
    repo.listPlans(),
    repo.listMandates(),
    repo.listApplications(),
    repo.listAgencies(),
    repo.listAgencyMembers(),
    repo.listReferrals(),
    repo.listBatches(),
  ]);

  // NSS で一度でも引き落としに成功した顧客
  const debited = new Set(
    batches.flatMap((b) => b.items.filter((i) => i.result === "success").map((i) => i.customerId)),
  );

  const rows: OrderRow[] = [];
  for (const card of cards) {
    const customer = customers.find((c) => c.id === card.customerId);
    if (!customer) continue;
    const myContracts = contracts
      .filter((c) => c.customerId === customer.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const myInvoices = invoices.filter((i) => i.customerId === customer.id);
    const mySubs = subscriptions.filter((s) => s.customerId === customer.id);
    const mandate = mandates.find((m) => m.customerId === customer.id) ?? null;
    const application =
      applications
        .filter((a) => a.customerId === customer.id)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0] ?? null;
    const agency = customer.agencyId
      ? (agencies.find((a) => a.id === customer.agencyId) ?? null)
      : null;
    const agencyMember = customer.agencyMemberId
      ? (agencyMembers.find((m) => m.id === customer.agencyMemberId) ?? null)
      : null;
    const dealType = agency ? resolveDealType(customer, agency) : null;
    const referral = referrals.find((r) => r.customerId === customer.id) ?? null;

    const progress = computeOrderProgress({
      customer,
      card,
      application,
      contracts: myContracts,
      invoices: myInvoices,
      subscriptions: mySubs,
      plans,
      mandate,
      agencyDealType: dealType,
      firstDebitSucceeded: debited.has(customer.id),
      now,
    });

    let row: OrderRow = {
      card,
      customer,
      progress,
      application,
      contracts: myContracts,
      invoices: myInvoices,
      subscriptions: mySubs,
      mandate,
      agency,
      agencyMember,
      dealType,
      referral,
      daysInStage: Math.max(0, -daysUntil(card.stageChangedAt.slice(0, 10), now)),
    };

    // 保存しているステージを実データに合わせる(休止・解約・見送りは手で戻すまでそのまま)
    if (opts.sync !== false && card.stage !== progress.stage && card.stage !== "closed") {
      try {
        const updated = await repo.updateOnboarding(card.id, {
          stage: progress.stage,
          actor: "自動（実データから判定）",
        });
        row = { ...row, card: updated, daysInStage: 0 };
      } catch {
        // 記録に失敗しても表示は実データ側のステージで行う
      }
    }
    rows.push(row);
  }
  const pendingApplications = applications
    .filter((a) => a.status === "submitted" && !a.customerId)
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  return { rows, pendingApplications, plans, agencies, agencyMembers };
}

/** 案件を「対応が急ぐ順」に並べる(受注確認 → 遅れあり → 停滞日数の長い順) */
export function sortOrderRows(rows: OrderRow[]): OrderRow[] {
  const stageWeight: Record<string, number> = {
    review: 0,
    setup: 1,
    application: 2,
    operating: 3,
    closed: 4,
  };
  return [...rows].sort((a, b) => {
    const w = stageWeight[a.progress.stage] - stageWeight[b.progress.stage];
    if (w !== 0) return w;
    const lateA = a.progress.open.some((i) => i.late) ? 0 : 1;
    const lateB = b.progress.open.some((i) => i.late) ? 0 : 1;
    if (lateA !== lateB) return lateA - lateB;
    return b.daysInStage - a.daysInStage;
  });
}
