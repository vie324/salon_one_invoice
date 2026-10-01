"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireActionUser } from "@/lib/auth";
import { appUrl } from "@/lib/config";
import { getJobRepository, getServiceRepository } from "@/lib/data";
import type { ApplicationInput } from "@/lib/data/repository";
import { toCredential } from "@/lib/domain/application";
import {
  AGENCY_LINK_EXPIRY_DAYS,
  APPLICATION_LINK_EXPIRY_DAYS,
  canAccessBilling,
} from "@/lib/domain/constants";
import type {
  AgencyDealType,
  ApplicationStatus,
  ReferralContactMethod,
  ReferralTimeSlot,
} from "@/lib/domain/types";
import { submitOrder, type OrderSubmission } from "@/lib/orders/submit";

function revalidateApplications(id?: string) {
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/applications/${id}`);
}

/** 申込を扱えるのは請求管理の権限を持つアカウント(全体管理者・請求管理) */
async function requireApplicationUser() {
  const user = await requireActionUser();
  if (!canAccessBilling(user.roles)) {
    throw new Error("申込管理へのアクセス権限がありません");
  }
  return user;
}

/** 申込フォームの絶対URL基点(NEXT_PUBLIC_APP_URL 優先、無ければリクエストヘッダから) */
async function applyBaseUrl(): Promise<string> {
  if (appUrl) return appUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/* ------------------------- 申込URL(管理者側) ------------------------- */

/** 申込・契約URLの発行内容(画面から渡す) */
export interface ApplicationLinkForm {
  name: string;
  expiryDays?: number;
  /** true = 申込＋契約(電子署名まで) / false = 申込のみ */
  withContract: boolean;
  planId?: string | null;
  optionKeys?: string[];
  /** null = お客様が入力 */
  storeCount?: number | null;
  initialFeeOverride?: number | null;
  monthlyPriceOverride?: number | null;
  agencyId?: string | null;
  agencyMemberId?: string | null;
  agencyDealType?: AgencyDealType | null;
  referralId?: string | null;
  allowInquiry?: boolean;
}

/**
 * 申込・契約URLを発行する。
 * 「申込＋契約」はプランが必須。代理店を指定すると、そのURLからの申込は代理店経由として
 * 記録され、受注確定時に代理店報酬が計上される。
 */
export async function createApplicationLinkAction(input: ApplicationLinkForm) {
  try {
    const user = await requireApplicationUser();
    if (!input.name.trim()) throw new Error("URLの名前(宛先メモ)を入力してください");
    const repo = await getServiceRepository();
    if (input.withContract) {
      if (!input.planId) throw new Error("申込＋契約のURLはプランを選んでください");
      const plan = await repo.getPlan(input.planId);
      if (!plan) throw new Error("プランが見つかりません");
    }
    if (input.agencyId) {
      const agency = await repo.getAgency(input.agencyId);
      if (!agency) throw new Error("代理店が見つかりません");
      if (input.agencyMemberId) {
        const members = await repo.listAgencyMembers(input.agencyId);
        if (!members.some((m) => m.id === input.agencyMemberId)) {
          throw new Error("営業マンがこの代理店に所属していません");
        }
      }
    }
    if (input.referralId) {
      const referral = await repo.getReferral(input.referralId);
      if (!referral) throw new Error("紹介が見つかりません");
      if (referral.customerId) throw new Error("この紹介は既に顧客登録済みです");
    }
    const link = await repo.createApplicationLink({
      ...input,
      expiryDays:
        input.expiryDays ??
        (input.agencyId && !input.referralId ? AGENCY_LINK_EXPIRY_DAYS : APPLICATION_LINK_EXPIRY_DAYS),
      createdBy: user.name,
    });
    revalidateApplications();
    revalidatePath("/orders");
    revalidatePath("/referrals");
    if (input.agencyId) revalidatePath(`/agencies/${input.agencyId}`);
    const base = await applyBaseUrl();
    return { ok: true as const, id: link.id, url: `${base}/apply/${link.token}` };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 受付の停止・再開。 */
export async function setApplicationLinkActiveAction(id: string, active: boolean) {
  try {
    await requireApplicationUser();
    const repo = await getServiceRepository();
    await repo.setApplicationLinkActive(id, active);
    revalidateApplications();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 申込URLの削除(受付済みの申込は残る)。 */
export async function deleteApplicationLinkAction(id: string) {
  try {
    await requireApplicationUser();
    const repo = await getServiceRepository();
    await repo.deleteApplicationLink(id);
    revalidateApplications();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* --------------------------- 申込(管理者側) --------------------------- */

/**
 * 連携情報(ID・パスワード)を復号して返す。
 * 画面では既定でマスク表示し、担当者が「表示」を押したときだけこの操作で取得する。
 */
export async function revealApplicationCredentialsAction(id: string) {
  try {
    await requireApplicationUser();
    const repo = await getServiceRepository();
    const credentials = await repo.revealApplicationCredentials(id);
    if (!credentials) throw new Error("申込が見つかりません");
    return { ok: true as const, credentials };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 対応状況の変更。 */
export async function updateApplicationStatusAction(id: string, status: ApplicationStatus) {
  try {
    await requireApplicationUser();
    const repo = await getServiceRepository();
    await repo.updateApplicationStatus(id, status);
    revalidateApplications(id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 申込内容から顧客を作成する。 */
export async function createCustomerFromApplicationAction(id: string) {
  try {
    const user = await requireApplicationUser();
    const repo = await getServiceRepository();
    const customer = await repo.createCustomerFromApplication(id, user.name);
    revalidateApplications(id);
    revalidatePath("/customers");
    return { ok: true as const, customerId: customer.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ------------------------ 申込フォーム(お客様側) ------------------------ */

/**
 * お客様が申込フォームから送信する(認証不要・トークンで保護)。
 * 認証ゲートを通らない経路のため getJobRepository を使い、
 * 受付可否(停止・期限切れ)はリポジトリ側で必ず判定する。
 */
export async function submitApplicationAction(
  token: string,
  input: {
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
  },
) {
  try {
    const companyName = input.companyName.trim();
    const email = input.email.trim();
    if (!companyName) throw new Error("法人名(個人の場合は個人名)を入力してください");
    if (!input.address.trim()) throw new Error("住所を入力してください");
    if (!input.representativeName.trim()) throw new Error("代表者名を入力してください");
    if (!input.phone.trim()) throw new Error("電話番号を入力してください");
    if (!email) throw new Error("メールアドレスを入力してください");
    // ブラウザ側の type="email" に加えてサーバーでも最低限の形式を確認する
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("メールアドレスの形式が正しくありません");
    }

    const h = await headers();
    const forwarded = h.get("x-forwarded-for") ?? "";
    const payload: ApplicationInput = {
      companyName,
      address: input.address,
      representativeTitle: input.representativeTitle,
      representativeName: input.representativeName,
      contactName: input.contactName,
      phone: input.phone,
      email,
      hotpepper: toCredential(input.hotpepperId, input.hotpepperPassword),
      minimo: toCredential(input.minimoId, input.minimoPassword),
      epark: toCredential(input.eparkId, input.eparkPassword),
      lineRequested: input.lineRequested,
      submittedIp: forwarded.split(",")[0]?.trim() || h.get("x-real-ip") || "",
    };

    const repo = await getJobRepository();
    const { link } = await repo.getApplicationLinkByToken(token);
    if (link?.withContract) {
      throw new Error("このURLは申込＋契約のURLです。ページを再読み込みしてください");
    }
    await repo.submitApplication(token, payload);
    revalidateApplications();
    revalidatePath("/orders");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** リクエスト元の IP / User-Agent (申込・電子署名の証跡用) */
async function clientMeta(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for") ?? "";
  return {
    ip: forwarded.split(",")[0]?.trim() || h.get("x-real-ip") || "",
    userAgent: h.get("user-agent") ?? "",
  };
}

/**
 * 申込＋契約URLからのお申込み(電子署名つき)。認証不要・トークンで保護。
 * 顧客・契約(締結済)・受注管理の案件までまとめて作り、受注確認待ちにする。
 */
export async function submitOrderAction(token: string, input: OrderSubmission) {
  try {
    const repo = await getJobRepository();
    const result = await submitOrder({
      repo,
      token,
      input,
      meta: await clientMeta(),
      baseUrl: await applyBaseUrl(),
    });
    revalidateApplications();
    revalidatePath("/orders");
    revalidatePath("/customers");
    revalidatePath("/contracts");
    revalidatePath("/referrals");
    return { ok: true as const, signUrl: result.signUrl };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 代理店URLの「まずは相談したい」からの問い合わせ。認証不要・トークンで保護。
 * 紹介・問い合わせの一覧に、代理店経由として届く(連絡希望の日時つき)。
 */
export async function submitInquiryAction(
  token: string,
  input: {
    companyName: string;
    contactName: string;
    phone: string;
    email: string;
    contactMethod: ReferralContactMethod;
    preferredDate?: string | null;
    preferredTimeSlot: ReferralTimeSlot;
    note?: string;
  },
) {
  try {
    const contactName = input.contactName.trim();
    const phone = input.phone.trim();
    const email = input.email.trim();
    if (!contactName) throw new Error("お名前をご入力ください");
    if (input.contactMethod !== "email" && !phone) throw new Error("お電話番号をご入力ください");
    if (input.contactMethod === "email" && !email) {
      throw new Error("メールでのご連絡をご希望の場合は、メールアドレスをご入力ください");
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("メールアドレスの形式が正しくありません");
    }
    const repo = await getJobRepository();
    const { link, state } = await repo.getApplicationLinkByToken(token);
    if (!link || state === "not_found") throw new Error("URLが見つかりません");
    if (state !== "ok") throw new Error("このURLは現在受付を停止しています");
    if (!link.allowInquiry) throw new Error("このURLではご相談を受け付けていません");
    const [agency, members] = link.agencyId
      ? await Promise.all([repo.getAgency(link.agencyId), repo.listAgencyMembers(link.agencyId)])
      : [null, []];
    const member = members.find((m) => m.id === link.agencyMemberId);
    const meta = await clientMeta();
    await repo.submitReferral(null, {
      referrerName: agency
        ? `${agency.name}${member ? `（${member.name}）` : ""}`
        : `申込・契約URL（${link.name}）`,
      companyName: input.companyName,
      contactName,
      phone,
      email,
      contactMethod: input.contactMethod,
      preferredDate: input.preferredDate || null,
      preferredTimeSlot: input.preferredTimeSlot,
      note: input.note,
      submittedIp: meta.ip,
      agencyId: link.agencyId,
      agencyMemberId: link.agencyMemberId,
      applicationLinkId: link.id,
    });
    revalidatePath("/referrals");
    if (link.agencyId) revalidatePath(`/agencies/${link.agencyId}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
