import type { InvoiceItemInput, Repository } from "@/lib/data/repository";
import {
  agencyCommissionAmount,
  agencyCommissionRate,
  agencyRateLabel,
  resolveDealType,
} from "@/lib/domain/agency";
import { computeDueDate, prorateMonthly, subscriptionMonthly } from "@/lib/domain/calculations";
import { AGENCY_DEAL_TYPES, REFERRAL_FREE_MONTHS, REFERRAL_REWARD_RATE } from "@/lib/domain/constants";
import { subscriptionFromTerms } from "@/lib/domain/pricing";
import { referralFreePeriodLabel, referralReward } from "@/lib/domain/referral";
import type { Customer } from "@/lib/domain/types";
import { getEmailProvider } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/email/templates";
import { formatJPY, toISODate } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * 受注確定と「請求を開始」(契約書なし)で共通の部品
 * ------------------------------------------------------------------------- */

/**
 * 初回請求書(初期費用＋初月日割り)の明細を組み立てる。
 * 紹介制度で登録された顧客は、初月の端数日数を0円の明細として残す(何が無料かを示す)。
 */
export function initialInvoiceItems(params: {
  startedOn: string;
  initialFee: number;
  /** 初期費用の明細名(例: 初期構築費用（CTR-202610-0001）) */
  initialFeeLabel: string;
  initialFeeTaxRate: number;
  /** 初月日割りの元にする月額(税抜・全店舗)。null なら日割りを載せない */
  monthly: { amount: number; taxRate: number } | null;
  referred: boolean;
}): { items: InvoiceItemInput[]; details: string[]; initialFeeCharged: number } {
  const items: InvoiceItemInput[] = [];
  const details: string[] = [];
  let initialFeeCharged = 0;
  if (params.initialFee > 0) {
    items.push({
      description: params.initialFeeLabel,
      quantity: 1,
      unitPrice: params.initialFee,
      taxRate: params.initialFeeTaxRate,
    });
    initialFeeCharged = params.initialFee;
    details.push(`初期費用 ${formatJPY(params.initialFee)}(税抜) を初回請求に計上`);
  }
  if (params.monthly && params.monthly.amount > 0) {
    // 初月日割り: 利用開始日〜月末を暦日按分。翌月分からは定期請求(引き落とし)。
    const proration = prorateMonthly(params.monthly.amount, params.startedOn);
    if (proration.amount > 0) {
      items.push({
        description: params.referred
          ? `月額利用料 初月日割り（${proration.label}）※ご紹介特典により無料`
          : `月額利用料 初月日割り（${proration.label}）`,
        quantity: 1,
        unitPrice: params.referred ? 0 : proration.amount,
        taxRate: params.monthly.taxRate,
      });
      details.push(
        params.referred
          ? `ご紹介特典により初月日割り ${formatJPY(proration.amount)}(税抜・${proration.days}日分)を無料`
          : `初月日割り ${formatJPY(proration.amount)}(税抜・${proration.days}日分)を初回請求に計上`,
      );
    }
  }
  return { items, details, initialFeeCharged };
}

/** 紹介制度: 紹介した側へのお支払い(初期費用の25%)を記録する。記録したら説明文を返す */
export async function recordReferralReward(
  repo: Repository,
  customerId: string,
  initialFeeCharged: number,
): Promise<string | null> {
  if (initialFeeCharged <= 0) return null;
  try {
    const referral = await repo.findReferralByCustomerId(customerId);
    // お支払い額が決まっている(お支払い済みを含む)謝礼は書き換えない
    if (!referral || referral.agencyId || referral.rewardStatus !== "pending") return null;
    await repo.setReferralReward(referral.id, {
      rewardBaseAmount: initialFeeCharged,
      rewardAmount: referralReward(initialFeeCharged),
      status: "payable",
    });
    return `ご紹介者へのお支払い ${formatJPY(referralReward(initialFeeCharged))}(初期費用の${Math.round(REFERRAL_REWARD_RATE * 100)}%)を計上`;
  } catch {
    // 謝礼の記録に失敗しても請求の開始そのものは通す(紹介制度の画面から手当てできる)
    return null;
  }
}

/** 代理店: 報酬(初期費用 × 区分の率)を記録する。支払対象になるのは初期費用の入金後 */
export async function recordAgencyCommission(
  repo: Repository,
  customer: Customer,
  invoiceId: string | null,
  initialFeeCharged: number,
): Promise<string | null> {
  if (!customer.agencyId || initialFeeCharged <= 0) return null;
  try {
    const agency = await repo.getAgency(customer.agencyId);
    if (!agency) return null;
    const dealType = resolveDealType(customer, agency);
    const amount = agencyCommissionAmount(initialFeeCharged, dealType);
    await repo.createAgencyCommission({
      agencyId: agency.id,
      agencyMemberId: customer.agencyMemberId ?? null,
      customerId: customer.id,
      invoiceId,
      dealType,
      baseAmount: initialFeeCharged,
      rate: agencyCommissionRate(dealType),
      amount,
    });
    return `代理店報酬 ${formatJPY(amount)}（${agency.name}・${AGENCY_DEAL_TYPES[dealType].label}・${agencyRateLabel(dealType)}）を計上。初期費用の入金後に支払対象`;
  } catch {
    // 報酬の記録に失敗しても請求の開始は通す(代理店の画面で確認できる)
    return null;
  }
}

/**
 * 受注確定の前に請求書の画面で作られた初回請求書(区分「初期費用」・取消以外)のうち、
 * どの契約にも紐付いていないもの(いちばん新しいもの)。
 */
async function findUnlinkedInitialInvoice(repo: Repository, customerId: string) {
  const [invoices, contracts] = await Promise.all([
    repo.listInvoices({ customerId, type: "initial" }),
    repo.listContracts({ customerId }),
  ]);
  const linked = new Set(contracts.map((c) => c.linkedInvoiceId).filter(Boolean));
  return (
    invoices
      .filter((i) => i.status !== "canceled" && !linked.has(i.id))
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate))[0] ?? null
  );
}

/** 請求書をメールで送る(送れたかと、画面に出す結果を返す) */
export async function emailInvoice(
  repo: Repository,
  invoiceId: string,
  label = "初回請求書",
): Promise<{ emailed: boolean; emailResult: string }> {
  const full = await repo.getInvoice(invoiceId);
  const org = await repo.getOrganization();
  if (!full?.customer?.email) {
    return { emailed: false, emailResult: `顧客のメールアドレスが未登録のため、${label}はメール送付していません` };
  }
  const res = await getEmailProvider().send({
    to: full.customer.email,
    subject: `【${org.name}】請求書 ${full.invoiceNumber} のご案内`,
    html: invoiceEmailHtml({ invoice: full, customerName: full.customer.name, org }),
  });
  return {
    emailed: res.ok,
    emailResult: res.ok
      ? (res.message ?? `${label}をメールで送付しました`)
      : `${label}のメール送付に失敗しました: ${res.message}`,
  };
}

/**
 * 受注確定(= 契約書第3条の「甲の承諾」)。締結済みの契約から請求を開始する。
 *
 * サロンワンの運用(初期費用＋初月日割りは請求書で銀行振込、以降は口座振替)に合わせて:
 * - 定期契約を作る(毎月の請求書を自動生成。翌月分から。店舗数・個別価格も契約書どおり)
 * - 初期費用＋初月日割り(利用開始日〜月末)の請求書(銀行振込)を作る
 *   (請求書の画面で先に初回請求書を作っていたら、新しく作らずにそれを使う)
 * - 顧客の支払方法を口座振替にする(翌月以降は NSS の引き落とし)
 * - 紹介制度で登録された顧客は特典を自動適用(初月日割り無料＋2ヶ月無料、紹介者へ初期費用の25%)
 * - 代理店経由の顧客は代理店報酬(初期費用 × 区分の率)を記録する
 * - 受注管理のチェック(申込内容の確認・初回請求書の送付)を付ける
 *
 * 受注管理の案件ページと、契約書の画面の「受注を確定」の両方から使う。
 */
export async function confirmOrder(params: {
  repo: Repository;
  contractId: string;
  startedOn: string;
  actor: string;
  /** 初回請求書をそのままメールで送るか */
  emailInvoice?: boolean;
}): Promise<
  | {
      ok: true;
      detail: string;
      customerId: string;
      invoiceId: string | null;
      subscriptionId: string | null;
      emailResult: string | null;
    }
  | { ok: false; error: string }
> {
  const { repo, contractId, startedOn, actor } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) {
    return { ok: false, error: "利用開始日を指定してください" };
  }
  const contract = await repo.getContract(contractId);
  if (!contract) return { ok: false, error: "契約書が見つかりません" };
  if (contract.status !== "signed") {
    return { ok: false, error: "締結済みの契約のみ受注を確定できます" };
  }
  if (contract.linkedSubscriptionId || contract.linkedInvoiceId) {
    return { ok: false, error: "この契約は既に受注確定（請求開始）済みです" };
  }

  // 紹介制度の特典対象か(紹介された側として登録された顧客か)を先に調べる
  const customer = await repo.getCustomer(contract.customerId);
  if (!customer) return { ok: false, error: "顧客が見つかりません" };
  const referred = Boolean(customer.referredByCustomerId);

  const details: string[] = [];
  let subscriptionId: string | null = null;
  let invoiceId: string | null = null;
  // 紹介謝礼・代理店報酬の対象になる初期費用(税抜)。初回請求に計上した額をそのまま使う
  let initialFeeCharged = 0;
  let initialItems: InvoiceItemInput[] = [];
  let initialDetails: string[] = [];
  const terms = contract.terms;

  const addInitial = (built: ReturnType<typeof initialInvoiceItems>) => {
    initialItems = built.items;
    initialFeeCharged = built.initialFeeCharged;
    initialDetails = built.details;
  };

  if (terms.planId) {
    const plan = await repo.getPlan(terms.planId);
    if (!plan) return { ok: false, error: "契約に紐付くプランが見つかりません" };
    // 毎月の請求額が契約書の月額合計と一致するよう、店舗数・個別価格を引き継ぐ
    const subPlan = subscriptionFromTerms(terms, plan);
    const sub = await repo.createSubscription({
      customerId: contract.customerId,
      planId: plan.id,
      startedOn,
      optionKeys: subPlan.optionKeys,
      storeCount: subPlan.storeCount,
      priceOverride: subPlan.priceOverride,
      // 紹介特典: 初月の日割りに加えて2ヶ月ぶん無料にする
      freeMonths: referred ? REFERRAL_FREE_MONTHS : 0,
    });
    subscriptionId = sub.id;
    details.push(
      `定期契約(${plan.name}・${subPlan.storeCount}店舗)を開始。毎月 ${formatJPY(
        subscriptionMonthly(plan, subPlan.optionKeys, subPlan.priceOverride, subPlan.storeCount),
      )}(税抜)を請求`,
    );
    if (subPlan.adjustment) details.push(subPlan.adjustment);

    const monthly =
      terms.monthlyFee ??
      subscriptionMonthly(plan, subPlan.optionKeys, subPlan.priceOverride, subPlan.storeCount);
    addInitial(
      initialInvoiceItems({
        startedOn,
        initialFee: terms.initialFee ?? plan.initialFee,
        initialFeeLabel: `初期構築費用（${contract.contractNumber}）`,
        initialFeeTaxRate: plan.taxRate,
        monthly: { amount: monthly, taxRate: plan.taxRate },
        referred,
      }),
    );
  } else if ((terms.initialFee ?? 0) > 0 || (terms.monthlyFee ?? 0) > 0) {
    // プラン連携なし(カスタム)の契約: 初回請求だけ作る(毎月の請求は定期請求で個別に設定)
    addInitial(
      initialInvoiceItems({
        startedOn,
        initialFee: terms.initialFee ?? 0,
        initialFeeLabel: `初期構築費用（${contract.contractNumber}）`,
        initialFeeTaxRate: 0.1,
        monthly: terms.monthlyFee ? { amount: terms.monthlyFee, taxRate: 0.1 } : null,
        referred,
      }),
    );
    details.push("プラン連携なしの契約のため、毎月の請求は「定期請求」で設定してください");
  } else {
    return {
      ok: false,
      error: "プランまたは初期費用が設定されていないため、受注を確定できません。契約内容を確認してください。",
    };
  }

  // 請求書の画面で先に初回請求書(区分「初期費用」)を作っていたら、それを使う(初期費用の二重請求を防ぐ)
  const existingInitial =
    initialItems.length > 0 ? await findUnlinkedInitialInvoice(repo, contract.customerId) : null;
  let createdInvoice = false;
  if (existingInitial) {
    invoiceId = existingInitial.id;
    details.push(
      `作成済みの初回請求書 ${existingInitial.invoiceNumber} をこの契約の初回請求書にしました（新しい初回請求書は作っていません）`,
    );
  } else if (initialItems.length > 0) {
    details.push(...initialDetails);
    const issueDate = toISODate(new Date());
    const inv = await repo.createInvoice({
      customerId: contract.customerId,
      type: "initial",
      issueDate,
      dueDate: computeDueDate(issueDate, 14),
      paymentMethod: "bank_transfer",
      items: initialItems,
      notes:
        `契約書 ${contract.contractNumber} に基づく初期費用` +
        `${initialItems.some((i) => i.description.includes("日割り")) ? "・初月日割り料金" : ""}のご請求です。` +
        `銀行振込にてお願いいたします。翌月以降の月額料金は口座振替(引き落とし)にてご請求いたします。`,
      status: "sent",
    });
    invoiceId = inv.id;
    createdInvoice = true;
  }

  // 未紐付けの場合のみ紐付け(並行実行による二重の受注確定を防止)。
  // 競合に敗れた場合は、直前に作成した定期契約・請求書を取り消して巻き戻す。
  const linked = await repo.linkContractBilling(contractId, {
    subscriptionId,
    invoiceId,
    actor,
    detail: `受注確定: ${details.join(" / ")}`,
    guardUnlinked: true,
  });
  if (!linked) {
    if (subscriptionId) await repo.updateSubscriptionStatus(subscriptionId, "canceled");
    if (invoiceId && createdInvoice) await repo.updateInvoiceStatus(invoiceId, "canceled");
    return { ok: false, error: "この契約は既に受注確定（請求開始）済みです" };
  }

  // 紹介制度: 紹介した側へのお支払い(初期費用の25%)を記録する
  if (referred) {
    const referralDetail = await recordReferralReward(repo, contract.customerId, initialFeeCharged);
    if (referralDetail) details.push(referralDetail);
  }

  // 代理店: 報酬(初期費用 × 区分の率)を記録する。支払対象になるのは初期費用の入金後。
  const agencyDetail = await recordAgencyCommission(repo, customer, invoiceId, initialFeeCharged);
  if (agencyDetail) details.push(agencyDetail);

  // 翌月以降の月額は口座振替(NSS)で請求する運用のため、支払方法を切り替える。
  if (customer.paymentMethod !== "direct_debit") {
    await repo.updateCustomer(customer.id, { paymentMethod: "direct_debit" });
    details.push("支払方法を口座振替に設定（翌月以降は NSS で引き落とし。口座振替依頼書の手続きを進めてください）");
  }
  if (referred) details.push(referralFreePeriodLabel(startedOn));

  // 初回請求書のメール送付(作成済みの請求書を使ったときは、送付済みのことがあるので送らない)
  let emailResult: string | null = null;
  let emailed = false;
  if (params.emailInvoice && invoiceId && createdInvoice) {
    ({ emailed, emailResult } = await emailInvoice(repo, invoiceId));
  } else if (params.emailInvoice && existingInitial) {
    emailResult = `作成済みの初回請求書 ${existingInitial.invoiceNumber} を使ったため、メールは送っていません（必要なら請求書の画面から送付してください）`;
  }

  // 受注管理のチェック: 受注確定 = 申込内容の確認済み。メールで送ったなら送付済み
  try {
    const card = (await repo.listOnboardings()).find((o) => o.customerId === customer.id);
    if (card) {
      await repo.updateOnboarding(card.id, {
        actor,
        checklist: [
          { key: "review_checked", done: true },
          ...(emailed ? [{ key: "initial_invoice_sent", done: true }] : []),
        ],
      });
    }
  } catch {
    // チェックの記録に失敗しても受注確定は通す
  }

  return {
    ok: true,
    detail: details.join(" / "),
    customerId: customer.id,
    invoiceId,
    subscriptionId,
    emailResult,
  };
}
