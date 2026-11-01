import { normalizeStoreCount, selectedOptions, subscriptionMonthly, withTax } from "@/lib/domain/calculations";
import { initialFeesByCustomer } from "@/lib/domain/client-pricing";
import type { BadgeTone } from "@/lib/domain/constants";
import {
  isMarketingLive,
  marketingStatusLabels,
  marketingStatusTone,
} from "@/lib/domain/marketing";
import { onboardingStageTone } from "@/lib/domain/onboarding";
import { planDisplayName } from "@/lib/domain/pricing";
import type {
  Agency,
  Application,
  MarketingService,
  OnboardingStage,
  Plan,
  PlanOption,
  Subscription,
} from "@/lib/domain/types";
import { formatDate, formatDayWithWeekday, toJstDateKey } from "@/lib/utils";
import type { OrderBook, OrderRow } from "./load";

/**
 * 申込一覧(どのお客様が・いつ・いくらで申し込んだか)の行を組み立てる。
 *
 * 1行 = 1件の申込。商品ごとに別の行にする:
 *   - SalonOne … お客様1件につき1行(申込・契約URLの申込日。無ければ契約書の締結日、
 *                 それも無い過去のお客様は顧客の登録日)
 *   - マーケティング代行 … 記録1件につき1行(申込日)。あとから追加したお客様も
 *                 申し込んだ月に並ぶ
 * 金額は毎月の請求書と同じ計算(定期請求があればその内容、受注確定前は契約書の内容)。
 */

export type SignupProduct = "system" | "marketing";

/** 申込日の根拠 */
export type SignupDateSource = "application" | "contract" | "registered" | "marketing";

export const signupDateSourceLabels: Record<SignupDateSource, string> = {
  application: "申込・契約URLから申込",
  contract: "契約書の締結日",
  registered: "申込日の記録なし（顧客の登録日）",
  marketing: "マーケティング代行の申込日",
};

export interface SignupChannel {
  kind: "agency" | "referral" | "direct";
  /** 代理店名 / 「紹介」 / 「直接」 */
  label: string;
  /** 営業担当・紹介者 */
  detail: string | null;
}

export interface SignupRow {
  /** 一覧のキー(system:顧客ID / app:申込ID / marketing:記録ID) */
  key: string;
  product: SignupProduct;
  customerId: string | null;
  /** 顧客登録前の申込(申込のみURL)の申込ID */
  applicationId: string | null;
  name: string;
  code: string;
  kana: string;
  /** 申込日 (YYYY-MM-DD・日本時間) */
  date: string;
  /** 申込月 (YYYY-MM) */
  month: string;
  /** 「10/30(木)」 */
  dateLabel: string;
  dateSource: SignupDateSource;
  /** 「申込・契約URLから申込」など(申込日の根拠) */
  dateSourceLabel: string;
  statusLabel: string;
  statusTone: BadgeTone;
  /** 休止・解約・見送り・停止(既定の一覧・合計からは外す) */
  closed: boolean;
  channel: SignupChannel;
  /* ---- SalonOne ---- */
  /** 「定価（月額）」。null = 料金未定(申込のみ) */
  planName: string | null;
  storeCount: number;
  /** 選んだオプション(税抜・1店舗あたり) */
  options: PlanOption[];
  /** 基本料金(税抜・1店舗あたり) */
  basePerStore: number | null;
  /** プランの定価(税抜・1店舗あたり) */
  listBasePerStore: number | null;
  /** 初期費用(税抜)。記録が無ければ null */
  initialFee: number | null;
  /** プランの初期費用(定価・税抜) */
  listInitialFee: number | null;
  /** 毎月の請求額(税抜・全店舗)。マーケティング代行は月額運用費の最低額 */
  monthly: number | null;
  monthlyWithTax: number | null;
  /** 申込時(契約書)の月額(税抜)。今の請求額と違えば表示する */
  signupMonthly: number | null;
  /** 定価と違う金額(個別価格)で契約している */
  customPrice: boolean;
  /** 利用開始日(定期請求の開始日) */
  startedOnLabel: string | null;
  contractId: string | null;
  contractNumber: string | null;
  /**
   * マーケティング代行の記録。SalonOne の行ではそのお客様が利用中か(停止は除く)、
   * マーケティング代行の行ではその記録自体。
   */
  marketing: MarketingService | null;
}

export interface SignupBook {
  rows: SignupRow[];
  /** 契約書を送って署名を待っている(まだ申し込んでいない)お客様の数 */
  awaitingSignature: number;
}

const systemStatusLabels: Record<OnboardingStage, string> = {
  application: "契約待ち",
  review: "受注確認待ち",
  setup: "導入準備中",
  operating: "運用中",
  closed: "休止・見送り",
};

/** 請求の元にする定期契約(稼働中 > 休止中 > 解約済み、同じなら新しい開始日) */
function pickSubscription<T extends Pick<Subscription, "status" | "startedOn">>(subs: T[]): T | null {
  const rank = { active: 0, paused: 1, canceled: 2 } as const;
  return (
    [...subs].sort(
      (a, b) => rank[a.status] - rank[b.status] || b.startedOn.localeCompare(a.startedOn),
    )[0] ?? null
  );
}

function channelOf(row: Pick<OrderRow, "agency" | "agencyMember" | "customer" | "referral">): SignupChannel {
  if (row.agency) {
    return { kind: "agency", label: row.agency.name, detail: row.agencyMember?.name ?? null };
  }
  if (row.customer.referredByCustomerId || row.referral) {
    return { kind: "referral", label: "紹介", detail: row.referral?.referrerName || null };
  }
  return { kind: "direct", label: "直接", detail: null };
}

function systemRow(
  row: OrderRow,
  plans: Map<string, Plan>,
  initialFees: Map<string, number>,
  marketing: MarketingService | null,
): SignupRow | null {
  const signed = row.contracts
    .filter((c) => c.status === "signed")
    .sort((a, b) => (a.signedAt ?? a.createdAt).localeCompare(b.signedAt ?? b.createdAt));
  const firstSigned = signed[0] ?? null;
  const latestSigned = signed[signed.length - 1] ?? null;

  // 契約書を送っただけ(署名待ち・下書き)のお客様は、まだ申し込んでいないので並べない
  const applied =
    row.application != null ||
    signed.length > 0 ||
    row.progress.contractOffline ||
    row.subscriptions.length > 0 ||
    row.progress.initialInvoiceId != null;
  if (!applied) return null;

  let date: string;
  let dateSource: SignupDateSource;
  if (row.application) {
    date = toJstDateKey(row.application.submittedAt);
    dateSource = "application";
  } else if (firstSigned?.signedAt) {
    date = toJstDateKey(firstSigned.signedAt);
    dateSource = "contract";
  } else {
    date = toJstDateKey(row.customer.createdAt);
    dateSource = "registered";
  }

  const terms = latestSigned?.terms ?? null;
  const sub = pickSubscription(row.subscriptions);
  const plan = sub ? plans.get(sub.planId) : terms?.planId ? plans.get(terms.planId) : undefined;

  let storeCount = 1;
  let optionKeys: string[] = [];
  let basePerStore: number | null = null;
  let monthly: number | null = null;
  if (sub && plan) {
    storeCount = normalizeStoreCount(sub.storeCount);
    optionKeys = sub.optionKeys ?? [];
    basePerStore = sub.priceOverride ?? plan.amount;
    monthly = subscriptionMonthly(plan, optionKeys, sub.priceOverride, storeCount);
  } else if (terms) {
    storeCount = normalizeStoreCount(terms.storeCount);
    optionKeys = terms.optionKeys ?? [];
    basePerStore = terms.priceOverride ?? plan?.amount ?? null;
    monthly =
      terms.monthlyFee ??
      (plan ? subscriptionMonthly(plan, optionKeys, terms.priceOverride, storeCount) : null);
  }

  const initialFee = initialFees.get(row.customer.id) ?? null;
  const taxRate = plan?.taxRate ?? 0.1;
  const signupMonthly = terms?.monthlyFee ?? null;
  const customPrice = Boolean(
    plan &&
      ((basePerStore != null && basePerStore !== plan.amount) ||
        (initialFee != null && initialFee !== plan.initialFee)),
  );

  const canceled =
    row.subscriptions.length > 0 && row.subscriptions.every((s) => s.status === "canceled");
  const stage = row.progress.stage;
  const statusLabel = stage === "closed" ? systemStatusLabels.closed : canceled ? "解約" : systemStatusLabels[stage];
  const statusTone: BadgeTone = canceled && stage !== "closed" ? "neutral" : onboardingStageTone[stage];

  return {
    key: `system:${row.customer.id}`,
    product: "system",
    customerId: row.customer.id,
    applicationId: row.application?.id ?? null,
    name: row.customer.name,
    code: row.customer.code,
    kana: row.customer.kana,
    date,
    month: date.slice(0, 7),
    dateLabel: formatDayWithWeekday(date),
    dateSource,
    dateSourceLabel: signupDateSourceLabels[dateSource],
    statusLabel,
    statusTone,
    closed: stage === "closed" || canceled,
    channel: channelOf(row),
    // 定期請求があるのにプランが見つからない(プランを消した)場合も「料金未定」とは出さない
    planName: plan ? planDisplayName(plan) : terms?.planName || (sub ? "プラン不明" : null),
    storeCount,
    options: plan ? selectedOptions(plan, optionKeys) : [],
    basePerStore,
    listBasePerStore: plan?.amount ?? null,
    initialFee,
    listInitialFee: plan?.initialFee ?? null,
    monthly,
    monthlyWithTax: monthly == null ? null : withTax(monthly, taxRate),
    signupMonthly,
    customPrice,
    startedOnLabel: sub ? formatDate(sub.startedOn) : null,
    contractId: latestSigned?.id ?? row.progress.contractId,
    contractNumber: latestSigned?.contractNumber ?? row.progress.contractNumber,
    marketing: isMarketingLive(marketing) ? marketing : null,
  };
}

/** まだ顧客登録していない申込(申込のみURL。料金は未定) */
function pendingApplicationRow(app: Application, agency: Pick<Agency, "name"> | null): SignupRow {
  const date = toJstDateKey(app.submittedAt);
  return {
    key: `app:${app.id}`,
    product: "system",
    customerId: null,
    applicationId: app.id,
    name: app.companyName,
    code: "",
    kana: "",
    date,
    month: date.slice(0, 7),
    dateLabel: formatDayWithWeekday(date),
    dateSource: "application",
    dateSourceLabel: signupDateSourceLabels.application,
    statusLabel: "顧客登録待ち",
    statusTone: "danger",
    closed: false,
    channel: agency
      ? { kind: "agency", label: agency.name, detail: null }
      : { kind: "direct", label: "直接", detail: app.linkName || null },
    planName: null,
    storeCount: 1,
    options: [],
    basePerStore: null,
    listBasePerStore: null,
    initialFee: null,
    listInitialFee: null,
    monthly: null,
    monthlyWithTax: null,
    signupMonthly: null,
    customPrice: false,
    startedOnLabel: null,
    contractId: null,
    contractNumber: null,
    marketing: null,
  };
}

function marketingRow(service: MarketingService, row: OrderRow): SignupRow {
  const date = service.appliedOn ?? service.startedOn ?? toJstDateKey(service.createdAt);
  return {
    key: `marketing:${service.id}`,
    product: "marketing",
    customerId: row.customer.id,
    applicationId: null,
    name: row.customer.name,
    code: row.customer.code,
    kana: row.customer.kana,
    date,
    month: date.slice(0, 7),
    dateLabel: formatDayWithWeekday(date),
    dateSource: "marketing",
    dateSourceLabel: signupDateSourceLabels.marketing,
    statusLabel: marketingStatusLabels[service.status],
    statusTone: marketingStatusTone[service.status],
    closed: service.status === "stopped",
    channel: channelOf(row),
    planName: "マーケティング代行",
    storeCount: 1,
    options: [],
    basePerStore: null,
    listBasePerStore: null,
    initialFee: service.initialFee,
    listInitialFee: null,
    monthly: service.monthlyMinimum,
    monthlyWithTax: withTax(service.monthlyMinimum, 0.1),
    signupMonthly: null,
    customPrice: false,
    startedOnLabel: service.startedOn ? formatDate(service.startedOn) : null,
    contractId: null,
    contractNumber: null,
    marketing: service,
  };
}

export function buildSignupBook(
  book: Pick<OrderBook, "rows" | "pendingApplications" | "plans" | "agencies">,
  marketingServices: MarketingService[],
): SignupBook {
  const plans = new Map(book.plans.map((p) => [p.id, p]));
  const initialFees = initialFeesByCustomer(
    book.rows.flatMap((r) => r.invoices),
    book.rows.flatMap((r) => r.contracts),
  );
  const marketingByCustomer = new Map(marketingServices.map((m) => [m.customerId, m]));
  const rowByCustomer = new Map(book.rows.map((r) => [r.customer.id, r]));

  const rows: SignupRow[] = [];
  let awaitingSignature = 0;
  for (const row of book.rows) {
    const built = systemRow(row, plans, initialFees, marketingByCustomer.get(row.customer.id) ?? null);
    if (built) rows.push(built);
    else awaitingSignature += 1;
  }
  const agencies = new Map(book.agencies.map((a) => [a.id, a]));
  for (const app of book.pendingApplications) {
    rows.push(pendingApplicationRow(app, app.agencyId ? (agencies.get(app.agencyId) ?? null) : null));
  }
  for (const service of marketingServices) {
    const row = rowByCustomer.get(service.customerId);
    // 顧客を削除(ゴミ箱へ移動)した記録は並べない
    if (row) rows.push(marketingRow(service, row));
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, "ja"));
  return { rows, awaitingSignature };
}
