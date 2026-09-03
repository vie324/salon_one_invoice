"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getJobRepository, getServiceRepository } from "@/lib/data";
import type {
  ContractInput,
  ContractTemplateInput,
} from "@/lib/data/repository";
import { requireActionUser } from "@/lib/auth";
import { appUrl } from "@/lib/config";
import { sanitizeContractForSigner } from "@/lib/contracts/build";
import {
  computeContractHash,
  generateAccessCode,
  generateSignToken,
} from "@/lib/contracts/hash";
import { getEmailProvider } from "@/lib/email";
import {
  contractSignRequestEmailHtml,
  contractSignedEmailHtml,
} from "@/lib/email/templates";
import {
  CONTRACT_SIGN_EXPIRY_DAYS,
  REFERRAL_FREE_MONTHS,
  REFERRAL_REWARD_RATE,
} from "@/lib/domain/constants";
import { referralFreePeriodLabel, referralReward } from "@/lib/domain/referral";
import {
  computeDueDate,
  prorateMonthly,
  subscriptionMonthly,
} from "@/lib/domain/calculations";
import type { ContractDeliveryMethod } from "@/lib/domain/types";
import { toISODate } from "@/lib/utils";

function revalidateContractViews(id?: string) {
  revalidatePath("/contracts");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/contracts/${id}`);
}

/** リクエスト元の IP / User-Agent (署名・閲覧の証跡用) */
async function clientMeta(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for") ?? "";
  return {
    ip: forwarded.split(",")[0]?.trim() || h.get("x-real-ip") || "",
    userAgent: h.get("user-agent") ?? "",
  };
}

/** 署名ページの絶対URL(NEXT_PUBLIC_APP_URL 優先、無ければリクエストヘッダから) */
async function signBaseUrl(): Promise<string> {
  if (appUrl) return appUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/* ---------------- スタッフ操作(要認証・RLS適用) ---------------- */

export async function createContractAction(input: ContractInput) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    const contract = await repo.createContract({ ...input, createdBy: user.name });
    revalidateContractViews();
    return { ok: true as const, id: contract.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateContractDraftAction(id: string, input: Partial<ContractInput>) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    await repo.updateContractDraft(id, { ...input, createdBy: user.name });
    revalidateContractViews(id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 署名依頼の送付(または再送)。
 * 1) 契約内容の SHA-256 ハッシュを計算して固定化
 * 2) 暗号乱数トークン(署名URL)と任意のアクセスコードを発行
 * 3) deliveryMethod に応じて、メール送付するか、リンクだけ発行する
 *
 * deliveryMethod="link" はメールを一切送らず、担当者が LINE・SMS・対面(QR)などで
 * 署名リンクを渡す運用。メール送信が未設定・使えない場合でも契約を進められる。
 * アクセスコードはメールに記載せず、担当者が別経路(電話等)で伝達する(2要素)。
 */
export async function sendContractAction(
  id: string,
  options: {
    email: string;
    requireCode: boolean;
    expiresInDays?: number;
    /** 省略時はメール送付(従来動作) */
    deliveryMethod?: ContractDeliveryMethod;
  },
) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    const meta = await clientMeta();
    const contract = await repo.getContract(id);
    if (!contract) return { ok: false as const, error: "契約書が見つかりません" };
    const deliveryMethod = options.deliveryMethod ?? "email";
    // リンク発行はメールを送らないため、宛先の入力は任意
    if (deliveryMethod === "email" && !options.email) {
      return { ok: false as const, error: "送付先メールアドレスを入力してください" };
    }

    const token = generateSignToken();
    const accessCode = options.requireCode
      ? (contract.accessCode ?? generateAccessCode())
      : null;
    const days = options.expiresInDays ?? CONTRACT_SIGN_EXPIRY_DAYS;
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const contentHash = computeContractHash(contract);

    const updated = await repo.markContractSent(id, {
      token,
      expiresAt,
      accessCode,
      contentHash,
      signerEmail: options.email.trim(),
      deliveryMethod,
      actor: user.name,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const signUrl = `${await signBaseUrl()}/sign/${token}`;
    if (deliveryMethod === "link") {
      revalidateContractViews(id);
      return {
        ok: true as const,
        accessCode,
        signUrl,
        deliveryMethod,
        emailResult: "署名リンクを発行しました（メールは送信していません）",
      };
    }

    const org = await repo.getOrganization();
    const res = await getEmailProvider().send({
      to: options.email,
      subject: `【${org.name}】${updated.title}（${updated.contractNumber}）ご署名のお願い`,
      html: contractSignRequestEmailHtml({ contract: updated, org, signUrl }),
    });

    revalidateContractViews(id);
    return {
      ok: true as const,
      accessCode,
      signUrl,
      deliveryMethod,
      emailResult: res.ok
        ? (res.message ?? "署名依頼メールを送信しました")
        : `メール送信失敗: ${res.message}`,
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** リマインドメールの送付(既存トークンのまま) */
export async function remindContractAction(id: string) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    const contract = await repo.getContract(id);
    if (!contract?.signToken || !contract.signerEmail) {
      return { ok: false as const, error: "送付済みの契約書ではありません" };
    }
    if (contract.status !== "sent" && contract.status !== "viewed") {
      return { ok: false as const, error: "リマインドできる状態ではありません(期限切れの場合は再送してください)" };
    }
    const org = await repo.getOrganization();
    const signUrl = `${await signBaseUrl()}/sign/${contract.signToken}`;
    const res = await getEmailProvider().send({
      to: contract.signerEmail,
      subject: `【${org.name}】(リマインド) ${contract.title}（${contract.contractNumber}）ご署名のお願い`,
      html: contractSignRequestEmailHtml({ contract, org, signUrl, isReminder: true }),
    });
    await repo.addContractEvent(id, {
      type: "reminded",
      actor: user.name,
      detail: `リマインドを ${contract.signerEmail} へ送信`,
    });
    revalidateContractViews(id);
    return {
      ok: true as const,
      emailResult: res.ok ? (res.message ?? "リマインドを送信しました") : `メール送信失敗: ${res.message}`,
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function cancelContractAction(id: string, reason: string) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    await repo.cancelContract(id, reason || "取消", user.name);
    revalidateContractViews(id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 書面(紙)で締結済みの契約を登録する(あらゆる締結経路に対応するためのフォールバック) */
export async function markContractSignedManuallyAction(
  id: string,
  params: { signerName: string; signedAt: string; note: string },
) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    if (!params.signerName) return { ok: false as const, error: "署名者名を入力してください" };
    await repo.markContractSignedManually(id, { ...params, actor: user.name });
    revalidateContractViews(id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 締結済み契約から請求を開始する。
 * サロンワンの運用(初期費用＋初月の日割りは請求書で銀行振込、以降は口座振替)に合わせて:
 * - プランが紐付いていれば定期契約(毎月の請求書自動生成)を作成。翌月分から生成される。
 * - 初期費用＋初月日割り(利用開始日〜月末)の請求書(銀行振込・送付済)を作成
 * - 顧客の支払方法を口座振替に設定し、翌月以降の定期請求は引き落としで請求する
 *
 * 紹介制度で登録された顧客(referredByCustomerId あり)は特典を自動で適用する:
 * - 初月の端数日数(日割り)は無料。請求書には0円の明細として残し、何が無料かを示す
 * - さらに2ヶ月ぶん無料。定期契約の初回請求日をその月数だけ先送りする
 * - 紹介した側へのお支払い(初期費用の25%)を紹介レコードに記録する
 */
export async function startContractBillingAction(id: string, params: { startedOn: string }) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    const contract = await repo.getContract(id);
    if (!contract) return { ok: false as const, error: "契約書が見つかりません" };
    if (contract.status !== "signed") {
      return { ok: false as const, error: "締結済みの契約のみ請求を開始できます" };
    }
    if (contract.linkedSubscriptionId || contract.linkedInvoiceId) {
      return { ok: false as const, error: "この契約の請求連携は既に開始されています" };
    }

    // 紹介制度の特典対象か(紹介された側として登録された顧客か)を先に調べる
    const customer = await repo.getCustomer(contract.customerId);
    const referred = Boolean(customer?.referredByCustomerId);

    const details: string[] = [];
    let subscriptionId: string | null = null;
    let invoiceId: string | null = null;
    // 紹介謝礼の対象になる初期費用(税抜)。初回請求に計上した額をそのまま使う
    let initialFeeCharged = 0;

    // 初回請求書(銀行振込)の明細。契約書第5条: 初月分・初期費用は銀行振込。
    const initialItems: { description: string; quantity: number; unitPrice: number; taxRate: number }[] = [];
    const initialNotes = (withProration: boolean) =>
      `契約書 ${contract.contractNumber} に基づく初期費用${withProration ? "・初月日割り料金" : ""}のご請求です。` +
      `銀行振込にてお願いいたします。翌月以降の月額料金は口座振替(引き落とし)にてご請求いたします。`;

    if (contract.terms.planId) {
      const plan = await repo.getPlan(contract.terms.planId);
      if (!plan) return { ok: false as const, error: "紐付くプランが見つかりません" };
      const sub = await repo.createSubscription({
        customerId: contract.customerId,
        planId: plan.id,
        startedOn: params.startedOn,
        optionKeys: contract.terms.optionKeys,
        // 紹介特典: 初月の日割りに加えて2ヶ月ぶん無料にする
        freeMonths: referred ? REFERRAL_FREE_MONTHS : 0,
      });
      subscriptionId = sub.id;
      details.push(`定期契約(${plan.name})を開始`);

      if (plan.initialFee > 0) {
        initialItems.push({
          description: `初期構築費用（${contract.contractNumber}）`,
          quantity: 1,
          unitPrice: plan.initialFee,
          taxRate: plan.taxRate,
        });
        initialFeeCharged = plan.initialFee;
      }
      // 初月日割り: 利用開始日〜月末を暦日按分。翌月分からは定期請求(引き落とし)で
      // 自動生成されるため、開始月のみここで請求する。
      const monthly =
        contract.terms.monthlyFee ?? subscriptionMonthly(plan, contract.terms.optionKeys);
      const proration = prorateMonthly(monthly, params.startedOn);
      if (proration.amount > 0) {
        // 紹介特典: 初月の端数日数は無料。0円の明細として残し、何が無料かを示す
        initialItems.push({
          description: referred
            ? `月額利用料 初月日割り（${proration.label}）※ご紹介特典により無料`
            : `月額利用料 初月日割り（${proration.label}）`,
          quantity: 1,
          unitPrice: referred ? 0 : proration.amount,
          taxRate: plan.taxRate,
        });
        details.push(
          referred
            ? `ご紹介特典により初月日割り ${proration.amount.toLocaleString("ja-JP")}円(税抜・${proration.days}日分)を無料`
            : `初月日割り ${proration.amount.toLocaleString("ja-JP")}円(税抜・${proration.days}日分)を初回請求に計上`,
        );
      }
      if (plan.initialFee > 0) {
        details.push(`初期費用 ${plan.initialFee.toLocaleString("ja-JP")}円 を初回請求に計上`);
      }
    } else if (
      (contract.terms.initialFee && contract.terms.initialFee > 0) ||
      (contract.terms.monthlyFee && contract.terms.monthlyFee > 0)
    ) {
      if (contract.terms.initialFee && contract.terms.initialFee > 0) {
        initialItems.push({
          description: `初期構築費用（${contract.contractNumber}）`,
          quantity: 1,
          unitPrice: contract.terms.initialFee,
          taxRate: 0.1,
        });
        initialFeeCharged = contract.terms.initialFee;
        details.push(`初期費用の請求書を作成`);
      }
      if (contract.terms.monthlyFee && contract.terms.monthlyFee > 0) {
        const proration = prorateMonthly(contract.terms.monthlyFee, params.startedOn);
        if (proration.amount > 0) {
          initialItems.push({
            description: referred
              ? `月額利用料 初月日割り（${proration.label}）※ご紹介特典により無料`
              : `月額利用料 初月日割り（${proration.label}）`,
            quantity: 1,
            unitPrice: referred ? 0 : proration.amount,
            taxRate: 0.1,
          });
          details.push(
            referred
              ? `ご紹介特典により初月日割り ${proration.amount.toLocaleString("ja-JP")}円(税抜)を無料`
              : `初月日割り ${proration.amount.toLocaleString("ja-JP")}円(税抜)を計上`,
          );
        }
      }
    } else {
      return {
        ok: false as const,
        error: "プランまたは初期費用が設定されていないため、請求を開始できません。申込内容を確認してください。",
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
        notes: initialNotes(initialItems.some((i) => i.description.includes("日割り"))),
        status: "sent",
      });
      invoiceId = inv.id;
    }

    // 未紐付けの場合のみ紐付け(並行実行による二重の請求開始を防止)。
    // 競合に敗れた場合は、直前に作成した定期契約・請求書を取り消して巻き戻す。
    const linked = await repo.linkContractBilling(id, {
      subscriptionId,
      invoiceId,
      actor: user.name,
      detail: details.join(" / "),
      guardUnlinked: true,
    });
    if (!linked) {
      if (subscriptionId) await repo.updateSubscriptionStatus(subscriptionId, "canceled");
      if (invoiceId) await repo.updateInvoiceStatus(invoiceId, "canceled");
      return { ok: false as const, error: "この契約の請求連携は既に開始されています" };
    }

    // 紹介制度: 紹介した側へのお支払い(初期費用の25%)を記録する。
    // 金額が確定するのはこのタイミング(初回請求に初期費用を計上した時)。
    if (referred && initialFeeCharged > 0) {
      try {
        const referral = await repo.findReferralByCustomerId(contract.customerId);
        if (referral) {
          await repo.setReferralReward(referral.id, {
            rewardBaseAmount: initialFeeCharged,
            rewardAmount: referralReward(initialFeeCharged),
            status: "payable",
          });
          details.push(
            `ご紹介者へのお支払い ${referralReward(initialFeeCharged).toLocaleString("ja-JP")}円(初期費用の${Math.round(REFERRAL_REWARD_RATE * 100)}%)を計上`,
          );
        }
      } catch {
        // 謝礼の記録に失敗しても請求開始そのものは通す(紹介制度の画面から手当てできる)
      }
    }

    // 翌月以降の月額は口座振替(引き落とし)で請求する運用のため、支払方法を切り替える。
    // 定期請求の自動生成は顧客の支払方法を参照する(口座振替なら引き落とし予定で発行)。
    if (customer && customer.paymentMethod !== "direct_debit") {
      await repo.updateCustomer(customer.id, { paymentMethod: "direct_debit" });
      details.push("支払方法を口座振替に設定(翌月以降は引き落とし。振替依頼書の回収を進めてください)");
    }
    if (referred) {
      details.push(referralFreePeriodLabel(params.startedOn));
    }

    revalidateContractViews(id);
    revalidatePath("/subscriptions");
    revalidatePath("/invoices");
    revalidatePath("/pipeline");
    return { ok: true as const, detail: details.join(" / ") };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ---------------- テンプレート管理 ---------------- */

export async function createContractTemplateAction(input: ContractTemplateInput) {
  try {
    const repo = await getServiceRepository();
    const tpl = await repo.createContractTemplate(input);
    revalidatePath("/contracts/templates");
    return { ok: true as const, id: tpl.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateContractTemplateAction(
  id: string,
  input: Partial<ContractTemplateInput>,
) {
  try {
    const repo = await getServiceRepository();
    await repo.updateContractTemplate(id, input);
    revalidatePath("/contracts/templates");
    revalidatePath(`/contracts/templates/${id}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ---------------- 公開署名ページ用(トークンが資格情報) ---------------- */
// 未認証の契約者が実行するため、サービスロールのリポジトリを使う。
// アクセス制御は署名トークン(暗号乱数)+アクセスコード+試行回数制限で行う。

/**
 * 閲覧の記録。メールクライアントのリンク先読み等での誤記録を避けるため、
 * ページ表示後にブラウザ(クライアント)から呼び出す。
 */
export async function recordContractViewAction(token: string) {
  try {
    const repo = await getJobRepository();
    const contract = await repo.getContractByToken(token);
    // アクセスコード設定時はコード検証後に閲覧記録する(内容が見えていないため)
    if (!contract || contract.accessCode) return { ok: true as const };
    const meta = await clientMeta();
    await repo.recordContractViewed(token, meta);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** アクセスコード検証後に契約内容を取得する(コード必須の契約用) */
export async function loadContractForSigningAction(token: string, code: string) {
  try {
    const repo = await getJobRepository();
    const meta = await clientMeta();
    const verify = await repo.verifyContractAccessCode(token, code, meta);
    if (!verify.ok) return { ok: false as const, error: verify.error, locked: verify.locked };
    const contract = await repo.getContractByToken(token);
    if (!contract) return { ok: false as const, error: "契約書が見つかりません" };
    // 社内CRM情報(customer)とアクセスコードはクライアントへ返さない
    return { ok: true as const, contract: sanitizeContractForSigner(contract) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function verifyContractCodeAction(token: string, code: string) {
  try {
    const repo = await getJobRepository();
    const meta = await clientMeta();
    return await repo.verifyContractAccessCode(token, code, meta);
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function signContractAction(
  token: string,
  params: { signerName: string; accessCode?: string },
) {
  try {
    if (!params.signerName.trim()) {
      return { ok: false as const, error: "署名者氏名を入力してください" };
    }
    const repo = await getJobRepository();
    const meta = await clientMeta();
    const result = await repo.signContract(token, {
      signerName: params.signerName.trim(),
      accessCode: params.accessCode,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    if (!result.ok) return result;

    // 締結完了通知(双方保管のため契約者・自社の両方へ)
    try {
      const org = await repo.getOrganization();
      const signUrl = `${await signBaseUrl()}/sign/${token}`;
      const email = getEmailProvider();
      const html = contractSignedEmailHtml({ contract: result.contract, org, signUrl });
      const subject = `【${org.name}】${result.contract.title}（${result.contract.contractNumber}）締結完了のお知らせ`;
      if (result.contract.signerEmail) {
        await email.send({ to: result.contract.signerEmail, subject, html });
      }
      if (org.email) {
        await email.send({ to: org.email, subject, html });
      }
    } catch {
      // 通知メールの失敗は締結自体には影響させない(証跡はDBに保全済み)
    }

    revalidateContractViews(result.contract.id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function declineContractAction(
  token: string,
  params: { reason: string; accessCode?: string },
) {
  try {
    const repo = await getJobRepository();
    const meta = await clientMeta();
    const result = await repo.declineContract(token, {
      reason: params.reason || "辞退",
      accessCode: params.accessCode,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    if (!result.ok) return result;
    revalidateContractViews(result.contract.id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
