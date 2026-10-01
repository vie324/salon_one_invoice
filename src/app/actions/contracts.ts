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
import { CONTRACT_SIGN_EXPIRY_DAYS } from "@/lib/domain/constants";
import type { ContractDeliveryMethod } from "@/lib/domain/types";
import { confirmOrder } from "@/lib/orders/confirm";

function revalidateContractViews(id?: string) {
  revalidatePath("/contracts");
  revalidatePath("/dashboard");
  revalidatePath("/orders");
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
 * 締結済み契約から請求を開始する(= 受注確定)。
 * 処理の中身は受注管理の「受注を確定」と共通(lib/orders/confirm.ts)。
 * 初回請求書(初期費用＋初月日割り・銀行振込)と毎月の請求(定期契約)を作り、
 * 紹介特典・代理店報酬もここで確定する。
 */
export async function startContractBillingAction(
  id: string,
  params: { startedOn: string; emailInvoice?: boolean },
) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    const res = await confirmOrder({
      repo,
      contractId: id,
      startedOn: params.startedOn,
      actor: user.name,
      emailInvoice: params.emailInvoice,
    });
    if (!res.ok) return res;
    revalidateContractViews(id);
    revalidatePath("/subscriptions");
    revalidatePath("/invoices");
    revalidatePath("/orders");
    revalidatePath(`/orders/${res.customerId}`);
    revalidatePath("/agencies");
    revalidatePath("/referrals");
    return { ok: true as const, detail: res.detail, emailResult: res.emailResult };
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
