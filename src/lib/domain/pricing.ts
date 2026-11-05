import { addMonths, formatNumber, toISODate } from "@/lib/utils";
import {
  normalizeStoreCount,
  normalizeStoreTiers,
  priceGroupsTotal,
  prorateMonthly,
  selectedOptions,
  storePriceGroups,
  storeRangeLabel,
  subscriptionMonthly,
  taxAmount,
} from "./calculations";
import { REFERRAL_FREE_MONTHS } from "./constants";
import type {
  ContractFeeRow,
  ContractFeeTable,
  ContractTerms,
  Plan,
  PlanOption,
  StorePriceGroup,
  StoreTier,
} from "./types";

/**
 * 申込・契約の料金計算(純粋関数)。
 *
 * 申込・契約URLのフォーム(お客様側のプレビュー)、契約書の料金表、受注確定で作る
 * 定期契約・初回請求のすべてがここを通るので、画面で見せた金額・契約書の金額・
 * 実際の請求額が食い違わない。
 *
 * 初期費用・月額とも1店舗あたりの金額。料金プランに店舗数による割引(N店舗目以降は○円)が
 * あれば、店舗ごとの金額を段に分けて数える。個別価格を入れた項目は全店舗その金額(割引は使わない)。
 */

/** 申込で選ばれた内容(プラン＋オプション＋店舗数＋個別価格) */
export interface OrderSelection {
  plan: Plan;
  optionKeys: string[];
  storeCount: number;
  /** 初期費用の個別価格(税抜・1店舗あたり)。null/未設定 = プラン通り(店舗数による割引も含む) */
  initialFeeOverride?: number | null;
  /** 月額基本料金の個別価格(税抜・1店舗あたり)。null/未設定 = プラン通り(店舗数による割引も含む) */
  monthlyPriceOverride?: number | null;
}

/** お客様に見せる見積り(税抜・税込) */
export interface OrderQuote {
  /** 「定価（月額）」のような表示名 */
  planName: string;
  taxRate: number;
  storeCount: number;
  /** 初期費用(税抜・1店舗目の金額。個別価格を反映) */
  initialFeePerStore: number;
  /** 初期費用の店舗ごとの内訳(割引が無ければ1まとまり) */
  initialFeeGroups: StorePriceGroup[];
  /** 初期費用(税抜・全店舗) */
  initialFee: number;
  initialFeeTax: number;
  initialFeeWithTax: number;
  /** 基本料金(税抜・1店舗目の金額。個別価格を反映) */
  basePerStore: number;
  /** 月額基本料金の店舗ごとの内訳(割引が無ければ1まとまり) */
  baseGroups: StorePriceGroup[];
  /** 選択したオプション(税抜・1店舗あたり) */
  options: PlanOption[];
  /** 月額(税抜・1店舗目) */
  monthlyPerStore: number;
  /** 月額合計(税抜・全店舗) */
  monthlyTotal: number;
  monthlyTotalTax: number;
  monthlyTotalWithTax: number;
  initialFeeOverridden: boolean;
  monthlyOverridden: boolean;
  /** 店舗数による割引で金額が変わっている(2つ以上の段になった) */
  volumeDiscounted: boolean;
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

/** 全店舗が同じ金額のまとまり(個別価格など) */
export function flatPriceGroups(unitPrice: number, storeCount: number | null | undefined): StorePriceGroup[] {
  return [{ from: 1, to: normalizeStoreCount(storeCount), unitPrice: Math.max(0, Math.round(unitPrice)) }];
}

/** プランの初期費用(1店舗あたり・店舗数による割引を含む)の内訳 */
export function planInitialFeeGroups(
  plan: Pick<Plan, "initialFee" | "storeTiers">,
  storeCount: number | null | undefined,
): StorePriceGroup[] {
  return storePriceGroups(plan.initialFee, plan.storeTiers, "initialFee", storeCount);
}

/**
 * 内訳の説明。割引が無ければ「100,000円 × 3店舗」、あれば「1店舗目 200,000円 ＋ 2〜3店舗目 100,000円 × 2」。
 * 1店舗なら金額だけ。
 */
export function describePriceGroups(groups: StorePriceGroup[]): string {
  if (groups.length === 0) return "";
  const yen = (n: number) => `${formatNumber(n)}円`;
  if (groups.length === 1) {
    const g = groups[0];
    const n = g.to - g.from + 1;
    return n > 1 ? `${yen(g.unitPrice)} × ${n}店舗` : yen(g.unitPrice);
  }
  return groups
    .map((g) => {
      const n = g.to - g.from + 1;
      return `${storeRangeLabel(g)} ${yen(g.unitPrice)}${n > 1 ? ` × ${n}` : ""}`;
    })
    .join(" ＋ ");
}

/**
 * 料金プランの店舗数による割引の説明(例: 「2店舗目以降: 初期 100,000円・月額 25,000円 / 店舗」)。
 * only を渡すとその項目(初期費用か月額)の段だけ。
 */
export function describeStoreTiers(
  tiers: StoreTier[] | null | undefined,
  only?: "initialFee" | "monthly",
): string[] {
  return normalizeStoreTiers(tiers ?? [])
    .filter((t) => !only || t[only] != null)
    .map((t) => {
      const parts = [
        t.initialFee != null && only !== "monthly" ? `初期 ${formatNumber(t.initialFee)}円` : null,
        t.monthly != null && only !== "initialFee" ? `月額 ${formatNumber(t.monthly)}円` : null,
      ].filter(Boolean);
      return `${t.fromStore}店舗目以降: ${parts.join("・")} / 店舗`;
    });
}

export function computeOrderQuote(sel: OrderSelection): OrderQuote {
  const { plan } = sel;
  const storeCount = normalizeStoreCount(sel.storeCount);
  const optionKeys = validOptionKeys(plan, sel.optionKeys);
  const initialOverride = normalizeOverride(sel.initialFeeOverride);
  const monthlyOverride = normalizeOverride(sel.monthlyPriceOverride);
  // 初期費用も月額と同じく1店舗あたり。個別価格なら全店舗その金額、無ければプラン(店舗数による割引を含む)
  const initialFeeGroups =
    initialOverride != null ? flatPriceGroups(initialOverride, storeCount) : planInitialFeeGroups(plan, storeCount);
  const baseGroups =
    monthlyOverride != null
      ? flatPriceGroups(monthlyOverride, storeCount)
      : storePriceGroups(plan.amount, plan.storeTiers, "monthly", storeCount);
  const initialFee = priceGroupsTotal(initialFeeGroups);
  const optionsPerStore = selectedOptions(plan, optionKeys).reduce((s, o) => s + o.monthly, 0);
  const monthlyTotal = priceGroupsTotal(baseGroups) + optionsPerStore * storeCount;
  const initialFeeTax = taxAmount(initialFee, plan.taxRate);
  const monthlyTotalTax = taxAmount(monthlyTotal, plan.taxRate);
  return {
    planName: planDisplayName(plan),
    taxRate: plan.taxRate,
    storeCount,
    initialFeePerStore: initialFeeGroups[0].unitPrice,
    initialFeeGroups,
    initialFee,
    initialFeeTax,
    initialFeeWithTax: initialFee + initialFeeTax,
    basePerStore: baseGroups[0].unitPrice,
    baseGroups,
    options: selectedOptions(plan, optionKeys),
    monthlyPerStore: baseGroups[0].unitPrice + optionsPerStore,
    monthlyTotal,
    monthlyTotalTax,
    monthlyTotalWithTax: monthlyTotal + monthlyTotalTax,
    initialFeeOverridden: initialOverride != null && initialOverride !== plan.initialFee,
    monthlyOverridden: monthlyOverride != null && monthlyOverride !== plan.amount,
    volumeDiscounted: initialFeeGroups.length > 1 || baseGroups.length > 1,
  };
}

/** 請求する初期費用(税抜)。初回請求書の明細の作り方も決める */
export interface InitialFeeCharge {
  /** 合計(税抜・全店舗) */
  amount: number;
  /**
   * 店舗ごとの内訳。合計と一致するときだけ入る(明細を「1店舗あたり × 店舗数」で段ごとに載せる)。
   * null なら1件の金額として明細に載せる(店舗数で掛ける前に締結した契約など)。
   */
  groups: StorePriceGroup[] | null;
  storeCount: number;
}

/** 内訳が 1店舗目〜店舗数 を隙間なく覆い、0円以上の整数か */
function validGroups(groups: StorePriceGroup[] | null | undefined, storeCount: number): StorePriceGroup[] | null {
  if (!groups || groups.length === 0) return null;
  let next = 1;
  for (const g of groups) {
    if (!Number.isInteger(g.from) || !Number.isInteger(g.to) || g.from !== next || g.to < g.from) return null;
    if (!Number.isFinite(g.unitPrice) || g.unitPrice < 0 || Math.round(g.unitPrice) !== g.unitPrice) return null;
    next = g.to + 1;
  }
  return next - 1 === storeCount ? groups.map((g) => ({ ...g })) : null;
}

/** 合計・内訳・店舗数から、請求する初期費用をそろえる(内訳が合計と食い違えば内訳は使わない) */
export function initialFeeCharge(
  amount: number,
  groups: StorePriceGroup[] | null | undefined,
  storeCount: number | null | undefined,
): InitialFeeCharge {
  const stores = normalizeStoreCount(storeCount);
  const total = Math.max(0, Math.round(Number(amount) || 0));
  const valid = validGroups(groups, stores);
  return { amount: total, groups: valid && priceGroupsTotal(valid) === total ? valid : null, storeCount: stores };
}

/** 請求書の明細1行(税抜) */
export interface FeeLine {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

/**
 * 初期費用の請求明細。受注確定・「請求を開始」・請求書の手作成で同じ書き方にする。
 * - 全店舗同じ金額: 「初期構築費用 1店舗あたり」× 店舗数 の1行
 * - 店舗数による割引: 段ごと(「初期構築費用 1店舗目」「初期構築費用 2〜3店舗目・1店舗あたり」× 2 …)
 * - 1店舗・内訳の無い契約(店舗数で掛ける前に締結した契約): 合計の1行
 * 0円なら明細を作らない。明細名は「初期」で始まる(初期費用の行として数えるため)。
 */
export function initialFeeLines(
  fee: InitialFeeCharge,
  label: string,
  taxRate: number,
  ref?: string | null,
): FeeLine[] {
  if (fee.amount <= 0) return [];
  const note = ref ? `（${ref}）` : "";
  const groups = fee.storeCount > 1 ? fee.groups : null;
  if (groups && groups.length === 1) {
    return [{ description: `${label} 1店舗あたり${note}`, quantity: fee.storeCount, unitPrice: groups[0].unitPrice, taxRate }];
  }
  if (groups) {
    return groups.map((g) => {
      const q = g.to - g.from + 1;
      return {
        description: `${label} ${storeRangeLabel(g)}${q > 1 ? "・1店舗あたり" : ""}${note}`,
        quantity: q,
        unitPrice: g.unitPrice,
        taxRate,
      };
    });
  }
  return [{ description: `${label}${note}`, quantity: 1, unitPrice: fee.amount, taxRate }];
}

/**
 * 契約の申込条件から、請求する初期費用を決める。
 * - 契約書に初期費用(合計)があれば、その金額どおり(締結した金額は変えない)。内訳があれば内訳どおりの明細
 * - 無ければ プランの初期費用(1店舗あたり・店舗数による割引を含む) × 店舗数
 */
export function initialFeeFromTerms(
  terms: Pick<ContractTerms, "initialFee" | "initialFeeGroups" | "storeCount">,
  plan: Pick<Plan, "initialFee" | "storeTiers"> | null | undefined,
): InitialFeeCharge {
  if (terms.initialFee != null) {
    return initialFeeCharge(terms.initialFee, terms.initialFeeGroups ?? null, terms.storeCount);
  }
  const groups = plan ? planInitialFeeGroups(plan, terms.storeCount) : flatPriceGroups(0, terms.storeCount);
  return initialFeeCharge(priceGroupsTotal(groups), groups, terms.storeCount);
}

/** 申込の内容から契約書の申込条件(構造化)を作る */
export function termsFromSelection(sel: OrderSelection, startDate: string | null = null): ContractTerms {
  const quote = computeOrderQuote(sel);
  const tiers = normalizeStoreTiers(sel.plan.storeTiers);
  return {
    planId: sel.plan.id,
    planName: quote.planName,
    optionKeys: quote.options.map((o) => o.key),
    storeCount: quote.storeCount,
    initialFee: quote.initialFee,
    initialFeeGroups: quote.initialFeeGroups,
    monthlyFee: quote.monthlyTotal,
    priceOverride: normalizeOverride(sel.monthlyPriceOverride),
    // 締結した時点のプランの割引を写して残す(あとでプランを変えても、この契約の金額は変わらない)
    storeTiers: tiers.length > 0 ? tiers : null,
    startDate,
    notes: "",
  };
}

/** 料金表の行(1店舗あたりの金額)。割引で段に分かれるときは段ごとの行にする */
function priceRows(label: string, groups: StorePriceGroup[], suffix: string, note?: string): ContractFeeRow[] {
  if (groups.length === 1) {
    const row: ContractFeeRow = { item: label, amount: `${formatNumber(groups[0].unitPrice)}円（${suffix}）` };
    if (note) row.note = note;
    return [row];
  }
  return groups.map((g) => {
    const row: ContractFeeRow = {
      item: `${label}（${storeRangeLabel(g)}）`,
      amount: `${formatNumber(g.unitPrice)}円（${suffix}）`,
    };
    if (note) row.note = note;
    return row;
  });
}

/** 申込の内容から契約書の料金表(別表)を作る。お客様がフォームで見た金額と同じになる。 */
export function feeTablesFromSelection(sel: OrderSelection): ContractFeeTable[] {
  const q = computeOrderQuote(sel);
  return [
    {
      title: `■ お申込みプラン: ${q.planName}・税別`,
      rows: [
        ...priceRows("初期構築費用", q.initialFeeGroups, "1店舗あたり", q.initialFeeOverridden ? "個別価格" : undefined),
        ...priceRows("月額利用料", q.baseGroups, "1店舗あたり", q.monthlyOverridden ? "個別価格" : undefined),
        ...q.options.map((o) => ({
          item: `オプション: ${o.name}`,
          amount: `${formatNumber(o.monthly)}円（月額・1店舗あたり）`,
        })),
        { item: "契約店舗数", amount: `${q.storeCount}店舗` },
        ...(q.storeCount > 1
          ? [{ item: "初期費用合計（税別）", amount: `${formatNumber(q.initialFee)}円` }]
          : []),
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
  /** 契約書に写した店舗数による割引(定期契約へ引き継ぐ)。null = 割引なし */
  storeTiers: StoreTier[] | null;
  /** 読み替えが発生したときの説明(証跡に残す) */
  adjustment: string | null;
}

export function subscriptionFromTerms(
  terms: Pick<ContractTerms, "optionKeys" | "storeCount" | "monthlyFee" | "priceOverride" | "storeTiers">,
  plan: Pick<Plan, "amount" | "options">,
): SubscriptionPlanFromTerms {
  const optionKeys = validOptionKeys(plan, terms.optionKeys ?? []);
  const storeCount = normalizeStoreCount(terms.storeCount);
  const override = normalizeOverride(terms.priceOverride);
  // 締結時点の割引(契約書の写し)だけを使う。今のプランの割引は使わない(締結済みの金額を変えない)
  const tiers = normalizeStoreTiers(terms.storeTiers ?? []);
  const storeTiers = tiers.length > 0 ? tiers : null;
  const computed = subscriptionMonthly(plan, optionKeys, override, storeCount, storeTiers);
  const target = terms.monthlyFee;
  if (target == null || target === computed) {
    return { optionKeys, storeCount, priceOverride: override, storeTiers, adjustment: null };
  }
  const optionSum = selectedOptions(plan, optionKeys).reduce((s, o) => s + o.monthly, 0);
  // 店舗数で割り切れるなら「1店舗あたりの基本料金」を個別価格にする
  const perStore = target / storeCount - optionSum;
  if (Number.isInteger(perStore) && perStore >= 0) {
    return {
      optionKeys,
      storeCount,
      priceOverride: perStore,
      storeTiers: null,
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
      storeTiers: null,
      adjustment: `契約書の月額合計 ${formatNumber(target)}円 に合わせ、基本料金(${storeCount}店舗分まとめ) ${formatNumber(merged)}円 として請求`,
    };
  }
  return {
    optionKeys: [],
    storeCount: 1,
    priceOverride: target,
    storeTiers: null,
    adjustment: `契約書の月額合計 ${formatNumber(target)}円 をそのまま基本料金として請求（オプションは合計に含む）`,
  };
}

/** 初月日割りの見込み(お客様向けの説明用)。利用開始日が未定なら null。 */
export function firstMonthProration(monthlyTotal: number, startDate: string | null) {
  if (!startDate) return null;
  return prorateMonthly(monthlyTotal, startDate);
}

/**
 * 過去のお客様(システムに契約書が無い)の毎月の請求を、このシステムで始める月の初期値。
 * 翌月から(利用開始が先なら、その翌月から。紹介特典の対象なら無料の2ヶ月ぶん先)。
 * 利用開始が過去でも、システムの外で請求済みの月までさかのぼって請求書を作らないようにする。
 */
export function defaultFirstBillingMonth(startedOn: string, referred: boolean, now = new Date()): string {
  const nextMonth = addMonths(toISODate(now).slice(0, 7), 1);
  if (!/^\d{4}-\d{2}/.test(startedOn)) return nextMonth;
  const fromStart = addMonths(startedOn.slice(0, 7), 1 + (referred ? REFERRAL_FREE_MONTHS : 0));
  return fromStart > nextMonth ? fromStart : nextMonth;
}
