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
import { getEmailProvider } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/email/templates";
import { formatJPY, toISODate } from "@/lib/utils";

/**
 * 受注確定(= 契約書第3条の「甲の承諾」)。締結済みの契約から請求を開始する。
 *
 * サロンワンの運用(初期費用＋初月日割りは請求書で銀行振込、以降は口座振替)に合わせて:
 * - 定期契約を作る(毎月の請求書を自動生成。翌月分から。店舗数・個別価格も契約書どおり)
 * - 初期費用＋初月日割り(利用開始日〜月末)の請求書(銀行振込)を作る
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
  const initialItems: InvoiceItemInput[] = [];
  const terms = contract.terms;

  const prorationItem = (monthly: number, taxRate: number) => {
    const proration = prorateMonthly(monthly, startedOn);
    if (proration.amount <= 0) return;
    // 紹介特典: 初月の端数日数は無料。0円の明細として残し、何が無料かを示す
    initialItems.push({
      description: referred
        ? `月額利用料 初月日割り（${proration.label}）※ご紹介特典により無料`
        : `月額利用料 初月日割り（${proration.label}）`,
      quantity: 1,
      unitPrice: referred ? 0 : proration.amount,
      taxRate,
    });
    details.push(
      referred
        ? `ご紹介特典により初月日割り ${formatJPY(proration.amount)}(税抜・${proration.days}日分)を無料`
        : `初月日割り ${formatJPY(proration.amount)}(税抜・${proration.days}日分)を初回請求に計上`,
    );
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

    const initialFee = terms.initialFee ?? plan.initialFee;
    if (initialFee > 0) {
      initialItems.push({
        description: `初期構築費用（${contract.contractNumber}）`,
        quantity: 1,
        unitPrice: initialFee,
        taxRate: plan.taxRate,
      });
      initialFeeCharged = initialFee;
      details.push(`初期費用 ${formatJPY(initialFee)}(税抜) を初回請求に計上`);
    }
    // 初月日割り: 利用開始日〜月末を暦日按分。翌月分からは定期請求(引き落とし)。
    const monthly =
      terms.monthlyFee ??
      subscriptionMonthly(plan, subPlan.optionKeys, subPlan.priceOverride, subPlan.storeCount);
    prorationItem(monthly, plan.taxRate);
  } else if ((terms.initialFee ?? 0) > 0 || (terms.monthlyFee ?? 0) > 0) {
    // プラン連携なし(カスタム)の契約: 初回請求だけ作る(毎月の請求は定期請求で個別に設定)
    if (terms.initialFee && terms.initialFee > 0) {
      initialItems.push({
        description: `初期構築費用（${contract.contractNumber}）`,
        quantity: 1,
        unitPrice: terms.initialFee,
        taxRate: 0.1,
      });
      initialFeeCharged = terms.initialFee;
      details.push(`初期費用 ${formatJPY(terms.initialFee)}(税抜) を初回請求に計上`);
    }
    if (terms.monthlyFee && terms.monthlyFee > 0) prorationItem(terms.monthlyFee, 0.1);
    details.push("プラン連携なしの契約のため、毎月の請求は「定期請求」で設定してください");
  } else {
    return {
      ok: false,
      error: "プランまたは初期費用が設定されていないため、受注を確定できません。契約内容を確認してください。",
    };
  }

  if (initialItems.length > 0) {
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
    if (invoiceId) await repo.updateInvoiceStatus(invoiceId, "canceled");
    return { ok: false, error: "この契約は既に受注確定（請求開始）済みです" };
  }

  // 紹介制度: 紹介した側へのお支払い(初期費用の25%)を記録する
  if (referred && initialFeeCharged > 0) {
    try {
      const referral = await repo.findReferralByCustomerId(contract.customerId);
      if (referral && !referral.agencyId) {
        await repo.setReferralReward(referral.id, {
          rewardBaseAmount: initialFeeCharged,
          rewardAmount: referralReward(initialFeeCharged),
          status: "payable",
        });
        details.push(
          `ご紹介者へのお支払い ${formatJPY(referralReward(initialFeeCharged))}(初期費用の${Math.round(REFERRAL_REWARD_RATE * 100)}%)を計上`,
        );
      }
    } catch {
      // 謝礼の記録に失敗しても受注確定そのものは通す(紹介制度の画面から手当てできる)
    }
  }

  // 代理店: 報酬(初期費用 × 区分の率)を記録する。支払対象になるのは初期費用の入金後。
  if (customer.agencyId && initialFeeCharged > 0) {
    try {
      const agency = await repo.getAgency(customer.agencyId);
      if (agency) {
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
        details.push(
          `代理店報酬 ${formatJPY(amount)}（${agency.name}・${AGENCY_DEAL_TYPES[dealType].label}・${agencyRateLabel(dealType)}）を計上。初期費用の入金後に支払対象`,
        );
      }
    } catch {
      // 報酬の記録に失敗しても受注確定は通す(代理店の画面で確認できる)
    }
  }

  // 翌月以降の月額は口座振替(NSS)で請求する運用のため、支払方法を切り替える。
  if (customer.paymentMethod !== "direct_debit") {
    await repo.updateCustomer(customer.id, { paymentMethod: "direct_debit" });
    details.push("支払方法を口座振替に設定（翌月以降は NSS で引き落とし。口座振替依頼書の手続きを進めてください）");
  }
  if (referred) details.push(referralFreePeriodLabel(startedOn));

  // 初回請求書のメール送付
  let emailResult: string | null = null;
  let emailed = false;
  if (params.emailInvoice && invoiceId) {
    const full = await repo.getInvoice(invoiceId);
    const org = await repo.getOrganization();
    if (full?.customer?.email) {
      const res = await getEmailProvider().send({
        to: full.customer.email,
        subject: `【${org.name}】請求書 ${full.invoiceNumber} のご案内`,
        html: invoiceEmailHtml({ invoice: full, customerName: full.customer.name, org }),
      });
      emailed = res.ok;
      emailResult = res.ok
        ? (res.message ?? "初回請求書をメールで送付しました")
        : `初回請求書のメール送付に失敗しました: ${res.message}`;
    } else {
      emailResult = "顧客のメールアドレスが未登録のため、初回請求書はメール送付していません";
    }
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
