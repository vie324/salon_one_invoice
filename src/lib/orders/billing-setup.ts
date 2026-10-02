import type { Repository } from "@/lib/data/repository";
import { billingDateInMonth, computeDueDate, normalizeStoreCount, subscriptionMonthly } from "@/lib/domain/calculations";
import { paymentMethodLabels } from "@/lib/domain/constants";
import type { ManualChecklistKey } from "@/lib/domain/onboarding";
import { normalizeOverride, planDisplayName, validOptionKeys } from "@/lib/domain/pricing";
import type { Invoice, PaymentMethod } from "@/lib/domain/types";
import { formatJPY, isMonthKey, toISODate } from "@/lib/utils";
import {
  emailInvoice,
  initialInvoiceItems,
  recordAgencyCommission,
  recordReferralReward,
} from "./confirm";
import { loadOrderBook } from "./load";

/**
 * 受注管理の「請求を開始」(システムに締結済みの契約書が無いお客様)の入力。
 * 旧「顧客ステータス」で手で進めていた過去のお客様や、書面・口頭で契約したお客様の
 * 初回請求書と毎月の請求(定期契約)を、まとめて設定する。
 */
export interface BillingSetupInput {
  /** 利用開始日(初月日割りの計算・定期契約の開始日) */
  startedOn: string;
  /** 初回請求書(初期費用＋初月日割り)。keep = 今回は決めない・変えない */
  initial:
    | { mode: "keep" }
    | { mode: "create"; initialFee: number; includeProration: boolean; emailInvoice: boolean }
    | { mode: "existing"; invoiceId: string }
    | { mode: "outside"; sent: boolean; paid: boolean }
    | { mode: "none" };
  /** 毎月の請求(定期契約)。keep = 今回は登録しない(あとで登録) */
  subscription:
    | { mode: "keep" }
    | {
        mode: "create";
        planId: string;
        optionKeys: string[];
        storeCount: number;
        /** 基本料金の個別価格(税抜・1店舗あたり)。null = プラン通り */
        priceOverride: number | null;
        /** このシステムで最初に請求する月(YYYY-MM) */
        firstBillingMonth: string;
        /** 毎月のお支払い方法 */
        paymentMethod: PaymentMethod;
      }
    | { mode: "none" };
}

type Result =
  | {
      ok: true;
      detail: string;
      invoiceId: string | null;
      subscriptionId: string | null;
      emailResult: string | null;
    }
  | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

/**
 * 「請求を開始」を実行する。先に入力をすべて確かめてから書き込む
 * (途中で失敗して、定期契約だけできて初回請求書が無い、といった中途半端な状態を作らない)。
 */
export async function setupBilling(params: {
  repo: Repository;
  customerId: string;
  input: BillingSetupInput;
  actor: string;
}): Promise<Result> {
  const { repo, customerId, input, actor } = params;
  const { initial, subscription } = input;
  // 画面以外から呼ばれても壊れたデータを作らないよう、選択肢を確かめる
  if (!["keep", "create", "existing", "outside", "none"].includes(initial?.mode)) {
    return fail("初回請求書の扱いを選んでください");
  }
  if (!["keep", "create", "none"].includes(subscription?.mode)) {
    return fail("毎月の請求の扱いを選んでください");
  }
  if (initial.mode === "keep" && subscription.mode === "keep") {
    return fail("設定する内容を選んでください");
  }

  const book = await loadOrderBook(repo, { sync: false });
  const row = book.rows.find((r) => r.customer.id === customerId);
  if (!row) return fail("案件が見つかりません");
  const { customer, progress } = row;

  if (progress.signed && !progress.billingStarted) {
    return fail(
      "締結済みの契約書があります。案件ページの「受注を確定する」から請求を開始してください（契約書の内容どおりに請求されます）。",
    );
  }
  if (!progress.contractDone && !progress.billingStarted) {
    return fail("先に契約の締結を記録してください（書面・旧運用で締結済みなら「締結済みにする」）。");
  }
  if (initial.mode !== "keep" && progress.initialMode === "system") {
    return fail("この案件には初回請求書（区分「初期費用」）が既にあります。請求書の画面で確認してください。");
  }
  if (subscription.mode === "create" && progress.hasSubscription) {
    return fail("毎月の請求（定期契約）は既に登録されています。変更は「定期請求」の画面で行ってください。");
  }
  const needsStart = initial.mode === "create" || subscription.mode === "create";
  if (needsStart && !/^\d{4}-\d{2}-\d{2}$/.test(input.startedOn)) {
    return fail("利用開始日を指定してください");
  }
  const referred = Boolean(customer.referredByCustomerId);

  /* ---- 入力の確認(ここではまだ書き込まない) ---- */
  let newSub: {
    planId: string;
    planLabel: string;
    optionKeys: string[];
    storeCount: number;
    priceOverride: number | null;
    firstBillingMonth: string;
    billingDay: number;
    monthly: number;
    taxRate: number;
    paymentMethod: PaymentMethod;
  } | null = null;
  if (subscription.mode === "create") {
    const plan = book.plans.find((p) => p.id === subscription.planId);
    if (!plan) return fail("プランを選んでください");
    if (!isMonthKey(subscription.firstBillingMonth)) {
      return fail("このシステムで請求を始める月を指定してください");
    }
    if (!paymentMethodLabels[subscription.paymentMethod]) {
      return fail("毎月のお支払い方法を選んでください");
    }
    const optionKeys = validOptionKeys(plan, subscription.optionKeys);
    const storeCount = normalizeStoreCount(subscription.storeCount);
    const priceOverride = normalizeOverride(subscription.priceOverride);
    newSub = {
      planId: plan.id,
      planLabel: planDisplayName(plan),
      optionKeys,
      storeCount,
      priceOverride,
      firstBillingMonth: subscription.firstBillingMonth,
      billingDay: plan.billingDay || 27,
      monthly: subscriptionMonthly(plan, optionKeys, priceOverride, storeCount),
      taxRate: plan.taxRate,
      paymentMethod: subscription.paymentMethod,
    };
  }

  let existingInvoice: Invoice | null = null;
  if (initial.mode === "existing") {
    existingInvoice = row.invoices.find((i) => i.id === initial.invoiceId) ?? null;
    if (!existingInvoice) return fail("この案件の請求書から選んでください");
    if (existingInvoice.status === "canceled") return fail("取り消した請求書は初回請求書にできません");
    if (existingInvoice.subscriptionId) {
      return fail("定期請求で作られた請求書は初回請求書にできません");
    }
  }

  let built: ReturnType<typeof initialInvoiceItems> | null = null;
  if (initial.mode === "create") {
    // 初月日割りの元にする月額: 今回登録する定期契約、無ければ登録済みの定期契約
    let monthly: { amount: number; taxRate: number } | null = null;
    if (initial.includeProration) {
      if (newSub) monthly = { amount: newSub.monthly, taxRate: newSub.taxRate };
      else {
        const sub =
          row.subscriptions.find((s) => s.status === "active") ??
          row.subscriptions.find((s) => s.status !== "canceled");
        const plan = sub ? book.plans.find((p) => p.id === sub.planId) : null;
        if (sub && plan) {
          monthly = {
            amount: subscriptionMonthly(plan, sub.optionKeys ?? [], sub.priceOverride, sub.storeCount ?? 1),
            taxRate: plan.taxRate,
          };
        }
      }
    }
    const feeTaxRate = newSub?.taxRate ?? monthly?.taxRate ?? 0.1;
    built = initialInvoiceItems({
      startedOn: input.startedOn,
      initialFee: Math.max(0, Math.round(Number(initial.initialFee) || 0)),
      initialFeeLabel: "初期構築費用",
      initialFeeTaxRate: feeTaxRate,
      monthly,
      referred,
    });
    if (built.items.length === 0) {
      return fail("初回請求書に載せる金額がありません（初期費用か初月日割りを入れてください。無い場合は「初回請求なし」を選びます）");
    }
  }

  /* ---- 書き込み ---- */
  const details: string[] = [];
  const toggles: { key: ManualChecklistKey; done: boolean }[] = [];
  let subscriptionId: string | null = null;
  let invoiceId: string | null = null;

  if (newSub) {
    const sub = await repo.createSubscription({
      customerId,
      planId: newSub.planId,
      startedOn: input.startedOn,
      optionKeys: newSub.optionKeys,
      storeCount: newSub.storeCount,
      priceOverride: newSub.priceOverride,
      firstBillingMonth: newSub.firstBillingMonth,
    });
    subscriptionId = sub.id;
    details.push(
      `定期契約（${newSub.planLabel}・${newSub.storeCount}店舗）を登録。毎月 ${formatJPY(newSub.monthly)}(税抜)を請求（最初の請求は ${billingDateInMonth(newSub.firstBillingMonth, newSub.billingDay).replace(/-/g, "/")} 引き落とし分）`,
    );
    toggles.push({ key: "sub_none", done: false });
    if (customer.paymentMethod !== newSub.paymentMethod) {
      await repo.updateCustomer(customer.id, { paymentMethod: newSub.paymentMethod });
      details.push(`毎月のお支払い方法を${paymentMethodLabels[newSub.paymentMethod]}に設定`);
    }
  } else if (subscription.mode === "none") {
    toggles.push({ key: "sub_none", done: true });
    details.push("毎月の請求はこのシステムで行わない設定にしました");
  }

  let emailResult: string | null = null;
  let emailed = false;
  if (initial.mode === "create" && built) {
    const issueDate = toISODate(new Date());
    const inv = await repo.createInvoice({
      customerId,
      type: "initial",
      issueDate,
      dueDate: computeDueDate(issueDate, 14),
      paymentMethod: "bank_transfer",
      items: built.items,
      notes:
        `初期費用${built.items.some((i) => i.description.includes("日割り")) ? "・初月日割り料金" : ""}のご請求です。` +
        "銀行振込にてお願いいたします。",
      status: "sent",
    });
    invoiceId = inv.id;
    details.push(`初回請求書 ${inv.invoiceNumber} を作成`, ...built.details);
    toggles.push({ key: "ib_none", done: false }, { key: "ib_issue", done: false });
    if (referred) {
      const referralDetail = await recordReferralReward(repo, customerId, built.initialFeeCharged);
      if (referralDetail) details.push(referralDetail);
    }
    const agencyDetail = await recordAgencyCommission(repo, customer, invoiceId, built.initialFeeCharged);
    if (agencyDetail) details.push(agencyDetail);
    if (initial.emailInvoice) {
      ({ emailed, emailResult } = await emailInvoice(repo, invoiceId));
      if (emailed) toggles.push({ key: "initial_invoice_sent", done: true });
    }
  } else if (initial.mode === "existing" && existingInvoice) {
    await repo.updateInvoiceType(existingInvoice.id, "initial");
    invoiceId = existingInvoice.id;
    details.push(`請求書 ${existingInvoice.invoiceNumber}（${formatJPY(existingInvoice.total)}）を初回請求書にしました`);
    toggles.push({ key: "ib_none", done: false }, { key: "ib_issue", done: false });
    // 送付済みの請求書なら、受注管理の「初回請求書の送付」も済んでいる
    if (existingInvoice.status !== "draft") toggles.push({ key: "initial_invoice_sent", done: true });
  } else if (initial.mode === "outside") {
    toggles.push(
      { key: "ib_none", done: false },
      { key: "ib_issue", done: true },
      { key: "initial_invoice_sent", done: initial.sent },
      { key: "ip_check", done: initial.paid },
    );
    details.push(
      `初回請求書はシステムの外で発行済み${initial.sent ? "・送付済み" : ""}${initial.paid ? "・入金確認済み" : "（入金の確認は受注管理で記録します）"}として記録`,
    );
  } else if (initial.mode === "none") {
    toggles.push({ key: "ib_none", done: true }, { key: "ib_issue", done: false });
    details.push("初回請求なし（初期費用・初月日割りなし）として記録");
  }

  // 請求を始めた = 申込内容の確認は済んでいる
  toggles.push({ key: "review_checked", done: true });
  try {
    await repo.updateOnboarding(row.card.id, { actor, checklist: toggles });
  } catch {
    // チェックの記録に失敗しても、請求書・定期契約は作れている(案件ページで付け直せる)
    details.push("受注管理のチェックの記録に失敗しました。案件ページで確認してください");
  }

  return {
    ok: true,
    detail: details.join(" / "),
    invoiceId,
    subscriptionId,
    emailResult,
  };
}
