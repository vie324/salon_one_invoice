import { daysUntil } from "@/lib/utils";
import {
  effectiveStatus,
  outstandingAmount,
  subscriptionMonthly,
  withTax,
} from "./calculations";
import type { BadgeTone } from "./constants";
import type {
  ContractStatus,
  Customer,
  DirectDebitMandate,
  Invoice,
  InvoiceStatus,
  MandateStatus,
  OnboardingChecklistItem,
  OnboardingStage,
  Plan,
  Subscription,
} from "./types";

/**
 * 顧客ステータス管理(カンバン)のドメインロジック。
 *
 * 運用フロー(サロンワンの標準):
 *   申込 → 契約 → 初回請求(初期費用＋初月日割り・銀行振込)
 *        → 振替手続き(依頼書の送付→受領→収納代行へ登録)
 *        → 入金チェック(初回振込の確認) → 運用中(毎月の引き落とし)
 *
 * カードのステージは手動(ドラッグ)で動かせるが、契約・請求・入金・口座振替の
 * 実データから「推奨ステージ」を導出し、ズレをカード上に表示して同期できる。
 */

/** カンバンの列順(左→右) */
export const ONBOARDING_STAGES: OnboardingStage[] = [
  "application",
  "contract",
  "initial_billing",
  "debit_setup",
  "initial_payment",
  "operating",
  "closed",
];

export const onboardingStageLabels: Record<OnboardingStage, string> = {
  application: "申込",
  contract: "契約",
  initial_billing: "初回請求",
  debit_setup: "振替手続き",
  initial_payment: "入金チェック",
  operating: "運用中",
  closed: "休止・解約",
};

export const onboardingStageDescriptions: Record<OnboardingStage, string> = {
  application: "申込の受付・ヒアリング・プラン確定",
  contract: "契約書の送付〜締結の確認",
  initial_billing: "初期費用＋初月日割りの請求書を発行・送付（銀行振込）",
  debit_setup: "口座振替依頼書の送付→受領、収納代行への登録",
  initial_payment: "初回振込の入金確認・消し込み",
  operating: "毎月の引き落とし・入金チェックの運用",
  closed: "休止・解約した顧客",
};

export const onboardingStageTone: Record<OnboardingStage, BadgeTone> = {
  application: "info",
  contract: "primary",
  initial_billing: "warning",
  debit_setup: "warning",
  initial_payment: "warning",
  operating: "success",
  closed: "neutral",
};

/**
 * ステージごとの標準チェックリスト(手動ToDo)。key は保存済みデータと突き合わせる
 * ため安定させること(変更すると既存カードのチェック状態が引き継がれない)。
 */
export const ONBOARDING_CHECKLIST: {
  stage: OnboardingStage;
  key: string;
  label: string;
}[] = [
  { stage: "application", key: "app_confirm", label: "申込内容を確認" },
  { stage: "application", key: "app_plan", label: "ヒアリング・プランを確定" },
  { stage: "contract", key: "ct_send", label: "契約書を送付" },
  { stage: "contract", key: "ct_signed", label: "締結を確認" },
  { stage: "initial_billing", key: "ib_issue", label: "初回請求書を発行（初期費用＋初月日割り）" },
  { stage: "initial_billing", key: "ib_send", label: "請求書を送付（銀行振込のご案内）" },
  { stage: "debit_setup", key: "dd_send", label: "口座振替依頼書を送付" },
  { stage: "debit_setup", key: "dd_receive", label: "依頼書を受領（回収）" },
  { stage: "debit_setup", key: "dd_register", label: "収納代行へ登録完了" },
  { stage: "initial_payment", key: "ip_check", label: "初回振込の入金を確認・消込" },
  { stage: "operating", key: "op_first", label: "初回引き落としの結果を確認" },
];

/** 新規カード用のチェックリスト(全項目・未完了) */
export function defaultChecklist(): OnboardingChecklistItem[] {
  return ONBOARDING_CHECKLIST.map((c) => ({
    key: c.key,
    label: c.label,
    done: false,
    doneAt: null,
    doneBy: "",
  }));
}

/**
 * 保存済みチェックリストを標準項目とマージする。
 * 項目の追加・文言変更を既存カードへ反映しつつ、チェック状態は引き継ぐ。
 */
export function mergeChecklist(
  stored: Partial<OnboardingChecklistItem>[] | null | undefined,
): OnboardingChecklistItem[] {
  const byKey = new Map((stored ?? []).map((s) => [s.key, s]));
  return ONBOARDING_CHECKLIST.map((c) => {
    const s = byKey.get(c.key);
    return {
      key: c.key,
      label: c.label,
      done: s?.done ?? false,
      doneAt: s?.doneAt ?? null,
      doneBy: s?.doneBy ?? "",
    };
  });
}

/* ---- 実データからのシグナル導出 ---- */

type InvoiceLike = Pick<
  Invoice,
  "id" | "type" | "status" | "issueDate" | "dueDate" | "total" | "amountPaid"
>;

export interface OnboardingSignalsInput {
  customer: Pick<Customer, "id" | "status" | "paymentMethod">;
  /** この顧客の契約書 */
  contracts: { status: ContractStatus }[];
  /** この顧客の請求書 */
  invoices: InvoiceLike[];
  /** この顧客の定期契約 */
  subscriptions: Pick<Subscription, "status" | "planId" | "optionKeys" | "priceOverride">[];
  plans: Pick<Plan, "id" | "taxRate" | "amount" | "options">[];
  mandate: Pick<DirectDebitMandate, "status"> | null;
  now?: Date;
}

/** 実データから導出した状態(カードに自動表示するシグナル) */
export interface OnboardingSignals {
  /** 契約書の進み具合(最も進んだ契約のステータス。無ければ null) */
  contractStatus: ContractStatus | null;
  /** 初回請求書(type=initial の最新) */
  initialInvoiceId: string | null;
  initialInvoiceStatus: InvoiceStatus | null;
  initialInvoiceTotal: number;
  /** 初回請求が入金済か(初回請求が無い場合は true 扱いにしない) */
  initialPaid: boolean;
  mandateStatus: MandateStatus | null;
  subscriptionActive: boolean;
  /** 現在の月額(税込)。定期契約が無ければ 0 */
  monthlyFee: number;
  /** 未収金(この顧客の全請求) */
  outstanding: number;
  /** 期限超過・引落失敗の件数 */
  overdueCount: number;
  /** 実データから見た推奨ステージ */
  recommendedStage: OnboardingStage;
}

/**
 * 契約ステータスの表示優先度(後ろほど優先)。
 * 取消・辞退より進行中(送付済・閲覧済)を、進行中より締結済を代表として表示する。
 */
const CONTRACT_PROGRESS: ContractStatus[] = [
  "canceled",
  "declined",
  "expired",
  "draft",
  "sent",
  "viewed",
  "signed",
];

export function computeOnboardingSignals(input: OnboardingSignalsInput): OnboardingSignals {
  const now = input.now ?? new Date();
  const invoices = input.invoices.map((i) => ({ ...i, status: effectiveStatus(i, now) }));

  // 契約: 最も進んだもの(締結済 > その他)を代表として表示
  const contractStatus =
    [...input.contracts].sort(
      (a, b) => CONTRACT_PROGRESS.indexOf(a.status) - CONTRACT_PROGRESS.indexOf(b.status),
    ).pop()?.status ?? null;
  const signed = contractStatus === "signed";
  const hasOpenContract = input.contracts.some(
    (c) => c.status !== "canceled" && c.status !== "declined",
  );

  // 初回請求(初期費用＋初月日割り)
  const initialInvoices = invoices
    .filter((i) => i.type === "initial" && i.status !== "canceled")
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  const initialInvoice = initialInvoices[initialInvoices.length - 1] ?? null;
  const initialIssued = initialInvoice != null && initialInvoice.status !== "draft";
  const initialPaid = initialInvoice != null && initialInvoice.status === "paid";

  const activeSubs = input.subscriptions.filter((s) => s.status === "active");
  const subscriptionActive = activeSubs.length > 0;
  const monthlyFee = activeSubs.reduce((sum, sub) => {
    const plan = input.plans.find((p) => p.id === sub.planId);
    if (!plan) return sum;
    return (
      sum +
      withTax(subscriptionMonthly(plan, sub.optionKeys ?? [], sub.priceOverride), plan.taxRate)
    );
  }, 0);

  const unpaid = invoices.filter((i) =>
    ["sent", "awaiting_payment", "partially_paid", "overdue", "failed"].includes(i.status),
  );
  const outstanding = unpaid.reduce((s, i) => s + outstandingAmount(i), 0);
  const overdueCount = invoices.filter(
    (i) => i.status === "overdue" || i.status === "failed",
  ).length;

  // ---- 推奨ステージの導出(前段が全て済んだ最初の未完了ステージ) ----
  const mandateStatus = input.mandate?.status ?? null;
  // 口座振替以外(振込・カード等)の顧客は振替手続き自体が不要
  const needsMandate = input.customer.paymentMethod === "direct_debit";
  const closed =
    input.customer.status === "inactive" ||
    (input.subscriptions.length > 0 &&
      input.subscriptions.every((s) => s.status === "canceled"));

  const doneContract = signed || subscriptionActive || initialIssued;
  const doneInitialBilling = initialIssued || subscriptionActive;
  const doneDebitSetup = !needsMandate || mandateStatus === "active";
  const doneInitialPayment = initialInvoice == null || initialPaid;

  let recommendedStage: OnboardingStage;
  if (closed) recommendedStage = "closed";
  else if (!doneContract) recommendedStage = hasOpenContract ? "contract" : "application";
  else if (!doneInitialBilling) recommendedStage = "initial_billing";
  else if (!doneDebitSetup) recommendedStage = "debit_setup";
  else if (!doneInitialPayment) recommendedStage = "initial_payment";
  else recommendedStage = "operating";

  return {
    contractStatus,
    initialInvoiceId: initialInvoice?.id ?? null,
    initialInvoiceStatus: initialInvoice?.status ?? null,
    initialInvoiceTotal: initialInvoice?.total ?? 0,
    initialPaid,
    mandateStatus,
    subscriptionActive,
    monthlyFee,
    outstanding,
    overdueCount,
    recommendedStage,
  };
}

/** 新規カードの初期ステージ(実データから推定) */
export function initialStageFor(input: OnboardingSignalsInput): OnboardingStage {
  return computeOnboardingSignals(input).recommendedStage;
}

/** カードのフォロー期日が超過しているか */
export function onboardingDueOver(dueDate: string | null, now = new Date()): boolean {
  return !!dueDate && daysUntil(dueDate, now) < 0;
}
