import { lineAmount, normalizeStoreCount, selectedOptions, subscriptionMonthly, withTax } from "./calculations";
import { planDisplayName } from "./pricing";
import type {
  Contract,
  Customer,
  Invoice,
  Plan,
  PlanOption,
  Subscription,
  SubscriptionStatus,
} from "./types";

/**
 * 顧客別料金(どのお客様に毎月いくら請求しているか)の集計(純粋関数)。
 *
 * 金額は定期請求が毎月の請求書を作るときと同じ計算(subscriptionMonthly)なので、
 * この一覧の金額と実際の請求額は一致する。定期契約1件 = 1行。
 */
export interface ClientPriceRow {
  subscriptionId: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  customerKana: string;
  /** 顧客メモ(特別待遇の理由など) */
  customerNotes: string;
  status: SubscriptionStatus;
  planId: string;
  /** 「定価（月額）」のような表示名 */
  planName: string;
  taxRate: number;
  /** プランの基本料金(定価・税抜・1店舗あたり) */
  listBasePerStore: number;
  /** 実際に請求する基本料金(個別価格を反映・税抜・1店舗あたり) */
  basePerStore: number;
  /** 基本料金がプランの定価と違う(個別価格) */
  priceOverridden: boolean;
  /** 選択中のオプション(税抜・1店舗あたり) */
  options: PlanOption[];
  storeCount: number;
  /** 毎月の請求額(税抜・全店舗) */
  monthly: number;
  monthlyWithTax: number;
  /** 同じオプション・店舗数をプランの定価で請求した場合の月額(税抜) */
  listMonthly: number;
  /** 定価との差(税抜・月額)。マイナス = 定価より安い */
  monthlyDiff: number;
  /** 初期費用(税抜)。初回請求書 → 締結済み契約書の順に探し、どちらも無ければ null */
  initialFee: number | null;
  /** プランの初期費用(定価・税抜) */
  listInitialFee: number;
  /** 初期費用がプランの定価と違う */
  initialFeeOverridden: boolean;
  nextBillingDate: string;
}

/** 初回請求書の明細のうち、初期費用の行か(受注確定・請求を開始は「初期構築費用」で作る) */
function isInitialFeeLine(description: string): boolean {
  return description.startsWith("初期");
}

/**
 * 顧客ごとの初期費用(税抜)。
 * 実際に請求した額を優先する(取消以外でいちばん新しい初回請求書の「初期構築費用」の行)。
 * 初回請求書が無い場合(初期費用0円・システム外で請求など)は、締結済み契約書の初期費用を使う。
 */
export function initialFeesByCustomer(
  invoices: Pick<Invoice, "customerId" | "type" | "status" | "issueDate" | "items">[],
  contracts: Pick<Contract, "customerId" | "status" | "signedAt" | "terms">[],
): Map<string, number> {
  const fees = new Map<string, number>();

  const signed = contracts
    .filter((c) => c.status === "signed" && c.terms.initialFee != null)
    .sort((a, b) => (a.signedAt ?? "").localeCompare(b.signedAt ?? ""));
  for (const c of signed) fees.set(c.customerId, c.terms.initialFee as number);

  const initialInvoices = invoices
    .filter((i) => i.type === "initial" && i.status !== "canceled")
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  for (const inv of initialInvoices) {
    const lines = inv.items.filter((item) => isInitialFeeLine(item.description));
    if (lines.length === 0) continue;
    fees.set(inv.customerId, lines.reduce((s, item) => s + lineAmount(item), 0));
  }
  return fees;
}

export function buildClientPriceRows(params: {
  subscriptions: Subscription[];
  plans: Plan[];
  customers: Customer[];
  initialFees: Map<string, number>;
}): ClientPriceRow[] {
  const planById = new Map(params.plans.map((p) => [p.id, p]));
  const customerById = new Map(params.customers.map((c) => [c.id, c]));
  const rows: ClientPriceRow[] = [];

  for (const sub of params.subscriptions) {
    const plan = planById.get(sub.planId);
    const customer = customerById.get(sub.customerId);
    // プラン・顧客が削除済みの契約は金額を出せないので並べない
    if (!plan || !customer) continue;

    const storeCount = normalizeStoreCount(sub.storeCount);
    const optionKeys = sub.optionKeys ?? [];
    const monthly = subscriptionMonthly(plan, optionKeys, sub.priceOverride, storeCount);
    const listMonthly = subscriptionMonthly(plan, optionKeys, null, storeCount);
    const basePerStore = sub.priceOverride ?? plan.amount;
    const initialFee = params.initialFees.get(customer.id) ?? null;

    rows.push({
      subscriptionId: sub.id,
      customerId: customer.id,
      customerCode: customer.code,
      customerName: customer.name,
      customerKana: customer.kana,
      customerNotes: customer.notes,
      status: sub.status,
      planId: plan.id,
      planName: planDisplayName(plan),
      taxRate: plan.taxRate,
      listBasePerStore: plan.amount,
      basePerStore,
      priceOverridden: basePerStore !== plan.amount,
      options: selectedOptions(plan, optionKeys),
      storeCount,
      monthly,
      monthlyWithTax: withTax(monthly, plan.taxRate),
      listMonthly,
      monthlyDiff: monthly - listMonthly,
      initialFee,
      listInitialFee: plan.initialFee,
      initialFeeOverridden: initialFee != null && initialFee !== plan.initialFee,
      nextBillingDate: sub.nextBillingDate,
    });
  }
  return rows;
}

/** 定価と違う金額(基本料金 or 初期費用)で契約しているか */
export function hasCustomPrice(row: Pick<ClientPriceRow, "priceOverridden" | "initialFeeOverridden">): boolean {
  return row.priceOverridden || row.initialFeeOverridden;
}
