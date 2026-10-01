import { formatNumber } from "@/lib/utils";
import {
  normalizeStoreCount,
  prorateMonthly,
  selectedOptions,
  subscriptionMonthly,
  taxAmount,
} from "./calculations";
import type { ContractFeeRow, ContractFeeTable, ContractTerms, Plan, PlanOption } from "./types";

/**
 * 申込・契約の料金計算(純粋関数)。
 *
 * 申込・契約URLのフォーム(お客様側のプレビュー)、契約書の料金表、受注確定で作る
 * 定期契約・初回請求のすべてがここを通るので、画面で見せた金額・契約書の金額・
 * 実際の請求額が食い違わない。
 */

/** 申込で選ばれた内容(プラン＋オプション＋店舗数＋個別価格) */
export interface OrderSelection {
  plan: Plan;
  optionKeys: string[];
  storeCount: number;
  /** 初期費用の個別価格(税抜)。null/未設定 = プラン通り */
  initialFeeOverride?: number | null;
  /** 月額基本料金の個別価格(税抜・1店舗あたり)。null/未設定 = プラン通り */
  monthlyPriceOverride?: number | null;
}

/** お客様に見せる見積り(税抜・税込) */
export interface OrderQuote {
  /** 「定価（月額）」のような表示名 */
  planName: string;
  taxRate: number;
  storeCount: number;
  /** 初期費用(税抜) */
  initialFee: number;
  initialFeeTax: number;
  initialFeeWithTax: number;
  /** 基本料金(税抜・1店舗あたり。個別価格を反映) */
  basePerStore: number;
  /** 選択したオプション(税抜・1店舗あたり) */
  options: PlanOption[];
  /** 月額(税抜・1店舗あたり) */
  monthlyPerStore: number;
  /** 月額合計(税抜・全店舗) */
  monthlyTotal: number;
  monthlyTotalTax: number;
  monthlyTotalWithTax: number;
  initialFeeOverridden: boolean;
  monthlyOverridden: boolean;
}

export function planDisplayName(plan: Pick<Plan, "name" | "term">): string {
  return `${plan.name}（${plan.term === "annual" ? "年間" : "月額"}）`;
}

/** 有効なオプションキーだけに絞る(プランに無いキーは捨てる) */
export function validOptionKeys(plan: Pick<Plan, "options">, keys: string[]): string[] {
  return plan.options.filter((o) => keys.includes(o.key)).map((o) => o.key);
}

/** 個別価格の入力値を「未設定(null) / 0以上の整数」にそろえる */
export function normalizeOverride(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function computeOrderQuote(sel: OrderSelection): OrderQuote {
  const { plan } = sel;
  const storeCount = normalizeStoreCount(sel.storeCount);
  const optionKeys = validOptionKeys(plan, sel.optionKeys);
  const initialOverride = normalizeOverride(sel.initialFeeOverride);
  const monthlyOverride = normalizeOverride(sel.monthlyPriceOverride);
  const initialFee = initialOverride ?? plan.initialFee;
  const basePerStore = monthlyOverride ?? plan.amount;
  const monthlyPerStore = subscriptionMonthly(plan, optionKeys, monthlyOverride, 1);
  const monthlyTotal = monthlyPerStore * storeCount;
  const initialFeeTax = taxAmount(initialFee, plan.taxRate);
  const monthlyTotalTax = taxAmount(monthlyTotal, plan.taxRate);
  return {
    planName: planDisplayName(plan),
    taxRate: plan.taxRate,
    storeCount,
    initialFee,
    initialFeeTax,
    initialFeeWithTax: initialFee + initialFeeTax,
    basePerStore,
    options: selectedOptions(plan, optionKeys),
    monthlyPerStore,
    monthlyTotal,
    monthlyTotalTax,
    monthlyTotalWithTax: monthlyTotal + monthlyTotalTax,
    initialFeeOverridden: initialOverride != null && initialOverride !== plan.initialFee,
    monthlyOverridden: monthlyOverride != null && monthlyOverride !== plan.amount,
  };
}

/** 申込の内容から契約書の申込条件(構造化)を作る */
export function termsFromSelection(sel: OrderSelection, startDate: string | null = null): ContractTerms {
  const quote = computeOrderQuote(sel);
  return {
    planId: sel.plan.id,
    planName: quote.planName,
    optionKeys: quote.options.map((o) => o.key),
    storeCount: quote.storeCount,
    initialFee: quote.initialFee,
    monthlyFee: quote.monthlyTotal,
    priceOverride: normalizeOverride(sel.monthlyPriceOverride),
    startDate,
    notes: "",
  };
}

/** 申込の内容から契約書の料金表(別表)を作る。お客様がフォームで見た金額と同じになる。 */
export function feeTablesFromSelection(sel: OrderSelection): ContractFeeTable[] {
  const q = computeOrderQuote(sel);
  const initialRow: ContractFeeRow = {
    item: "初期構築費用",
    amount: `${formatNumber(q.initialFee)}円`,
  };
  if (q.initialFeeOverridden) initialRow.note = "個別価格";
  const monthlyRow: ContractFeeRow = {
    item: "月額利用料",
    amount: `${formatNumber(q.basePerStore)}円（1店舗あたり）`,
  };
  if (q.monthlyOverridden) monthlyRow.note = "個別価格";
  return [
    {
      title: `■ お申込みプラン: ${q.planName}・税別`,
      rows: [
        initialRow,
        monthlyRow,
        ...q.options.map((o) => ({
          item: `オプション: ${o.name}`,
          amount: `${formatNumber(o.monthly)}円（月額・1店舗あたり）`,
        })),
        { item: "契約店舗数", amount: `${q.storeCount}店舗` },
        { item: "月額合計（税別）", amount: `${formatNumber(q.monthlyTotal)}円` },
      ],
    },
  ];
}

/**
 * 契約の申込条件から、受注確定で作る定期契約の内容を決める。
 *
 * 毎月の請求額 = (基本料金 + オプション) × 店舗数 が、契約書の「月額合計」と一致するようにする。
 * 契約書を個別に作って月額合計を手で書き換えた場合も、その金額どおりに請求されるよう
 * 基本料金の個別価格(priceOverride)へ読み替える。
 */
export interface SubscriptionPlanFromTerms {
  optionKeys: string[];
  storeCount: number;
  priceOverride: number | null;
  /** 読み替えが発生したときの説明(証跡に残す) */
  adjustment: string | null;
}

export function subscriptionFromTerms(
  terms: Pick<ContractTerms, "optionKeys" | "storeCount" | "monthlyFee" | "priceOverride">,
  plan: Pick<Plan, "amount" | "options">,
): SubscriptionPlanFromTerms {
  const optionKeys = validOptionKeys(plan, terms.optionKeys ?? []);
  const storeCount = normalizeStoreCount(terms.storeCount);
  const override = normalizeOverride(terms.priceOverride);
  const computed = subscriptionMonthly(plan, optionKeys, override, storeCount);
  const target = terms.monthlyFee;
  if (target == null || target === computed) {
    return { optionKeys, storeCount, priceOverride: override, adjustment: null };
  }
  const optionSum = selectedOptions(plan, optionKeys).reduce((s, o) => s + o.monthly, 0);
  // 店舗数で割り切れるなら「1店舗あたりの基本料金」を個別価格にする
  const perStore = target / storeCount - optionSum;
  if (Number.isInteger(perStore) && perStore >= 0) {
    return {
      optionKeys,
      storeCount,
      priceOverride: perStore,
      adjustment: `契約書の月額合計 ${formatNumber(target)}円 に合わせ、基本料金を ${formatNumber(perStore)}円/店舗 として請求`,
    };
  }
  // 割り切れない場合は1店舗分にまとめて、合計額を優先する
  const merged = target - optionSum;
  if (merged >= 0) {
    return {
      optionKeys,
      storeCount: 1,
      priceOverride: merged,
      adjustment: `契約書の月額合計 ${formatNumber(target)}円 に合わせ、基本料金(${storeCount}店舗分まとめ) ${formatNumber(merged)}円 として請求`,
    };
  }
  return {
    optionKeys: [],
    storeCount: 1,
    priceOverride: target,
    adjustment: `契約書の月額合計 ${formatNumber(target)}円 をそのまま基本料金として請求（オプションは合計に含む）`,
  };
}

/** 初月日割りの見込み(お客様向けの説明用)。利用開始日が未定なら null。 */
export function firstMonthProration(monthlyTotal: number, startDate: string | null) {
  if (!startDate) return null;
  return prorateMonthly(monthlyTotal, startDate);
}
