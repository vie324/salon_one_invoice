import { DEFAULT_TEMPLATE_SLUG } from "@/lib/contracts/default-template";
import { computeContractHash, generateSignToken } from "@/lib/contracts/hash";
import type { ApplicationInput, Repository } from "@/lib/data/repository";
import { applicationNotes, toCredential } from "@/lib/domain/application";
import { normalizeStoreCount } from "@/lib/domain/calculations";
import { CONTRACT_SIGN_EXPIRY_DAYS } from "@/lib/domain/constants";
import { computeOrderQuote, validOptionKeys, type OrderSelection } from "@/lib/domain/pricing";
import type { ApplicationLink, Plan } from "@/lib/domain/types";
import { getEmailProvider } from "@/lib/email";
import { orderNotificationEmailHtml, orderReceivedEmailHtml } from "@/lib/email/templates";
import { buildOrderContract, pickOrderTemplate } from "./contract-draft";

/**
 * 申込・契約URLからのお申込み(申込＋電子署名)を受け付ける。
 *
 *   1. 申込を記録(代理店・紹介の紐付けは URL のサーバー側設定から引き継ぐ)
 *   2. 顧客を作成し、すぐに申込へ紐付ける
 *   3. 契約書を作成 → 内容ハッシュを固定 → お客様の閲覧・電子署名を記録(締結済み)
 *   4. 申込に契約書を紐付け、紹介からのURLなら紹介も「顧客登録済」にする
 *   5. お客様へ受付完了メール、社内へ「受注確認待ち」の通知メール
 *
 * 締結済みの契約は、請求管理者が受注管理で内容を確認して「受注確定」したときに
 * 請求(初回請求書・毎月の請求)へつながる(契約書第3条: 甲の承諾で契約成立)。
 */

export interface OrderSubmission {
  companyName: string;
  address: string;
  representativeTitle: string;
  representativeName: string;
  contactName: string;
  phone: string;
  email: string;
  hotpepperId?: string;
  hotpepperPassword?: string;
  minimoId?: string;
  minimoPassword?: string;
  eparkId?: string;
  eparkPassword?: string;
  lineRequested: boolean;
  /** お客様が選んだオプション */
  optionKeys: string[];
  /** URLで店舗数を指定していない場合にお客様が入力する店舗数 */
  storeCount?: number;
  /** 電子署名: 署名者の氏名 */
  signerName: string;
  /** 電子署名: 契約内容への同意 */
  agreed: boolean;
  /** お客様が確認した契約書テンプレートの版(確認後に内容が変わっていないかの照合用) */
  templateId: string;
  templateVersion: number;
}

export interface OrderSubmitResult {
  customerId: string;
  contractId: string;
  /** 締結済み契約書の表示URL(お客様が保存できる) */
  signUrl: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 入力の検証(サーバー側で必ず行う) */
export function validateOrderSubmission(input: OrderSubmission): void {
  if (!input.companyName.trim()) throw new Error("法人名(個人の場合は個人名)を入力してください");
  if (!input.address.trim()) throw new Error("住所を入力してください");
  if (!input.representativeName.trim()) throw new Error("代表者名を入力してください");
  if (!input.phone.trim()) throw new Error("電話番号を入力してください");
  const email = input.email.trim();
  if (!email) throw new Error("メールアドレスを入力してください");
  if (!EMAIL_RE.test(email)) throw new Error("メールアドレスの形式が正しくありません");
  if (!input.signerName.trim()) throw new Error("署名者のお名前を入力してください");
  if (!input.agreed) throw new Error("契約内容をご確認のうえ、同意にチェックを入れてください");
}

/** URL の設定とお客様の選択から、申込むプラン・料金を決める */
export function orderSelectionFor(
  link: Pick<
    ApplicationLink,
    "storeCount" | "initialFeeOverride" | "monthlyPriceOverride"
  >,
  plan: Plan,
  chosen: { optionKeys: string[]; storeCount?: number },
): OrderSelection {
  const storeCount =
    link.storeCount != null ? link.storeCount : normalizeStoreCount(chosen.storeCount ?? 1);
  if (storeCount > 99) throw new Error("店舗数が多い場合は担当者へご相談ください（99店舗まで）");
  return {
    plan,
    optionKeys: validOptionKeys(plan, chosen.optionKeys),
    storeCount,
    initialFeeOverride: link.initialFeeOverride,
    monthlyPriceOverride: link.monthlyPriceOverride,
  };
}

export async function submitOrder(params: {
  repo: Repository;
  token: string;
  input: OrderSubmission;
  meta: { ip: string; userAgent: string };
  baseUrl: string;
}): Promise<OrderSubmitResult> {
  const { repo, token, input, meta, baseUrl } = params;
  validateOrderSubmission(input);

  const { link, state } = await repo.getApplicationLinkByToken(token);
  if (!link || state === "not_found") throw new Error("お申込みURLが見つかりません");
  if (state === "inactive") throw new Error("このお申込みURLは現在受付を停止しています");
  if (state === "expired") throw new Error("このお申込みURLは有効期限が切れています");
  if (!link.withContract || !link.planId) {
    throw new Error("このURLはお申込みのみのURLです。ページを再読み込みしてください");
  }

  const [plan, templates, org] = await Promise.all([
    repo.getPlan(link.planId),
    repo.listContractTemplates(),
    repo.getOrganization(),
  ]);
  if (!plan) throw new Error("お申込みのプランが見つかりません。担当者へお問い合わせください");
  const template = pickOrderTemplate(templates, DEFAULT_TEMPLATE_SLUG);
  if (!template) throw new Error("契約書が準備できていません。担当者へお問い合わせください");
  // お客様が確認した後に契約書(テンプレート)が更新されていたら、確認からやり直してもらう
  if (template.id !== input.templateId || template.version !== input.templateVersion) {
    throw new Error(
      "契約内容が更新されました。お手数ですがページを再読み込みし、最新の契約内容をご確認ください",
    );
  }

  const selection = orderSelectionFor(link, plan, {
    optionKeys: input.optionKeys,
    storeCount: input.storeCount,
  });
  const quote = computeOrderQuote(selection);
  const info = {
    companyName: input.companyName,
    address: input.address,
    representativeTitle: input.representativeTitle,
    representativeName: input.representativeName,
    email: input.email,
  };

  // 1) 申込
  const appInput: ApplicationInput = {
    companyName: input.companyName.trim(),
    address: input.address.trim(),
    representativeTitle: input.representativeTitle.trim(),
    representativeName: input.representativeName.trim(),
    contactName: input.contactName.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    hotpepper: toCredential(input.hotpepperId, input.hotpepperPassword),
    minimo: toCredential(input.minimoId, input.minimoPassword),
    epark: toCredential(input.eparkId, input.eparkPassword),
    lineRequested: input.lineRequested,
    submittedIp: meta.ip,
  };
  const application = await repo.submitApplication(token, appInput);

  // 2) 顧客(紹介からのURLなら紹介者・代理店も引き継ぐ)
  const referral = link.referralId ? await repo.getReferral(link.referralId) : null;
  const agencyId = link.agencyId ?? referral?.agencyId ?? null;
  const agencyMemberId = link.agencyId ? link.agencyMemberId : (referral?.agencyMemberId ?? null);
  const notes = [
    applicationNotes(application, { viaContractLink: true }),
    `プラン: ${quote.planName}・${quote.storeCount}店舗`,
  ].join("\n");
  const customer = await repo.createCustomer({
    name: appInput.companyName,
    contactName: appInput.contactName || appInput.representativeName,
    email: appInput.email,
    phone: appInput.phone,
    address: appInput.address,
    paymentMethod: "direct_debit",
    notes,
    assignee: link.createdBy,
    agencyId,
    agencyMemberId,
    agencyDealType: agencyId ? link.agencyDealType : null,
    referredByCustomerId: referral && !referral.agencyId ? referral.referrerCustomerId : null,
  });
  // 顧客ができた時点で申込に紐付ける。このあと契約書の作成などで失敗しても、
  // 申込が「未対応」のまま残って同じ顧客をもう一度登録してしまう、ということが起きない
  await repo.linkApplicationRecords(application.id, {
    customerId: customer.id,
    status: "customer_created",
  });

  // 3) 契約書 → 内容を固定 → 閲覧・電子署名の記録
  const draft = buildOrderContract({ template, org, info, selection });
  const created = await repo.createContract({
    ...draft,
    customerId: customer.id,
    createdBy: "申込・契約URL（お客様の入力）",
  });
  const signToken = generateSignToken();
  const sent = await repo.markContractSent(created.id, {
    token: signToken,
    expiresAt: new Date(Date.now() + CONTRACT_SIGN_EXPIRY_DAYS * 86_400_000).toISOString(),
    accessCode: null,
    contentHash: computeContractHash(created),
    signerEmail: appInput.email,
    deliveryMethod: "form",
    actor: `申込・契約URL（${link.name}）`,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  await repo.recordContractViewed(signToken, meta);
  const signed = await repo.signContract(signToken, {
    signerName: input.signerName.trim(),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  if (!signed.ok) throw new Error(signed.error);

  // 4) 紐付け
  await repo.linkApplicationRecords(application.id, { contractId: sent.id });
  if (referral && !referral.customerId) {
    await repo.updateReferral(referral.id, { customerId: customer.id, status: "customer_created" });
  }

  // 5) メール(失敗しても受付そのものは成立させる。証跡は DB に保全済み)
  const signUrl = `${baseUrl}/sign/${signToken}`;
  try {
    const email = getEmailProvider();
    await email.send({
      to: appInput.email,
      subject: `【${org.name}】お申込み・ご契約を受け付けました（${signed.contract.contractNumber}）`,
      html: orderReceivedEmailHtml({
        contract: signed.contract,
        org,
        signUrl,
        initialFeeWithTax: quote.initialFeeWithTax,
        monthlyWithTax: quote.monthlyTotalWithTax,
      }),
    });
    if (org.email) {
      const source = link.agencyId
        ? `代理店URL（${link.name}）`
        : link.referralId
          ? `紹介からのURL（${link.name}）`
          : `申込・契約URL（${link.name}）`;
      await email.send({
        to: org.email,
        subject: `【受注確認待ち】${appInput.companyName} 様からお申込みがありました`,
        html: orderNotificationEmailHtml({
          contract: signed.contract,
          org,
          orderUrl: `${baseUrl}/orders/${customer.id}`,
          source,
        }),
      });
    }
  } catch {
    // 通知メールの失敗は受付に影響させない
  }

  return { customerId: customer.id, contractId: sent.id, signUrl };
}
