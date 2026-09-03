"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireActionUser } from "@/lib/auth";
import { appUrl } from "@/lib/config";
import { getJobRepository, getServiceRepository } from "@/lib/data";
import type { ReferralInput } from "@/lib/data/repository";
import { canAccessBilling, REFERRAL_LINK_EXPIRY_DAYS } from "@/lib/domain/constants";
import { referralFormUrl, referralLinkUrl, referralReward } from "@/lib/domain/referral";
import type {
  ReferralContactMethod,
  ReferralStatus,
  ReferralTimeSlot,
} from "@/lib/domain/types";

function revalidateReferrals() {
  revalidatePath("/referrals");
  revalidatePath("/customers");
  revalidatePath("/dashboard");
}

/** 紹介制度を扱えるのは請求管理の権限を持つアカウント(全体管理者・請求管理) */
async function requireReferralUser() {
  const user = await requireActionUser();
  if (!canAccessBilling(user.roles)) {
    throw new Error("紹介制度へのアクセス権限がありません");
  }
  return user;
}

/** 紹介フォームの絶対URL基点(NEXT_PUBLIC_APP_URL 優先、無ければリクエストヘッダから) */
async function referralBaseUrl(): Promise<string> {
  if (appUrl) return appUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** 常設の紹介フォームURL(お客様へ配る基本のURL)。 */
export async function getReferralFormUrlAction() {
  const base = await referralBaseUrl();
  return { url: referralFormUrl(base) };
}

/* ------------------------- 紹介フォームURL(管理者側) ------------------------- */

/** 紹介者を指定した紹介フォームURLを発行する。 */
export async function createReferralLinkAction(input: {
  name: string;
  referrerCustomerId?: string | null;
  expiryDays?: number;
}) {
  try {
    const user = await requireReferralUser();
    if (!input.name.trim()) throw new Error("URLの名前(宛先メモ)を入力してください");
    const repo = await getServiceRepository();
    const link = await repo.createReferralLink({
      name: input.name,
      referrerCustomerId: input.referrerCustomerId ?? null,
      expiryDays: input.expiryDays ?? REFERRAL_LINK_EXPIRY_DAYS,
      createdBy: user.name,
    });
    revalidateReferrals();
    const base = await referralBaseUrl();
    return { ok: true as const, id: link.id, url: referralLinkUrl(base, link.token) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 紹介URLの受付を停止・再開する。 */
export async function setReferralLinkActiveAction(id: string, active: boolean) {
  try {
    await requireReferralUser();
    const repo = await getServiceRepository();
    await repo.setReferralLinkActive(id, active);
    revalidateReferrals();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 紹介URLを削除する(受付済みの紹介は残る)。 */
export async function deleteReferralLinkAction(id: string) {
  try {
    await requireReferralUser();
    const repo = await getServiceRepository();
    await repo.deleteReferralLink(id);
    revalidateReferrals();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ------------------------- 公開フォーム(お客様側) ------------------------- */

/**
 * 紹介フォームからの送信。認証不要。
 * token を渡すと紹介者を指定したURL経由、渡さないと常設フォーム(/refer)からの受付。
 */
export async function submitReferralAction(
  token: string | null,
  input: {
    referrerName: string;
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
    const referrerName = input.referrerName.trim();
    const contactName = input.contactName.trim();
    const phone = input.phone.trim();
    const email = input.email.trim();

    // 紹介者が分からないと特典のお支払い先が決まらないため必須にする
    if (!referrerName) throw new Error("ご紹介者のお名前を入力してください");
    if (!contactName) throw new Error("お名前をご入力ください");
    // 連絡してほしい方法に応じて、必要な連絡先だけを必須にする
    const needsPhone = input.contactMethod !== "email";
    if (needsPhone && !phone) throw new Error("お電話番号をご入力ください");
    if (input.contactMethod === "email" && !email) {
      throw new Error("メールでのご連絡をご希望の場合は、メールアドレスをご入力ください");
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("メールアドレスの形式が正しくありません");
    }

    const h = await headers();
    const forwarded = h.get("x-forwarded-for") ?? "";
    const payload: ReferralInput = {
      referrerName,
      companyName: input.companyName,
      contactName,
      phone,
      email,
      contactMethod: input.contactMethod,
      preferredDate: input.preferredDate || null,
      preferredTimeSlot: input.preferredTimeSlot,
      note: input.note,
      submittedIp: forwarded.split(",")[0]?.trim() ?? "",
    };
    // 公開フォームは認証ゲートを通らないため getJobRepository を使う
    const repo = await getJobRepository();
    await repo.submitReferral(token, payload);
    revalidateReferrals();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/* ------------------------- 紹介の対応(管理者側) ------------------------- */

/** 対応状況の変更(連絡済 / 対応不要 など)。 */
export async function updateReferralStatusAction(id: string, status: ReferralStatus) {
  try {
    await requireReferralUser();
    const repo = await getServiceRepository();
    await repo.updateReferral(id, { status });
    revalidateReferrals();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 「誰に紹介されたか」を既存の顧客に紐付ける。
 * 紐付けると、紹介報酬のお支払い先と、紹介された側の特典の判定がつながる。
 */
export async function linkReferrerCustomerAction(id: string, customerId: string | null) {
  try {
    await requireReferralUser();
    const repo = await getServiceRepository();
    await repo.updateReferral(id, { referrerCustomerId: customerId });
    revalidateReferrals();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 紹介内容から顧客を作成して紐付ける。 */
export async function createCustomerFromReferralAction(id: string) {
  try {
    const user = await requireReferralUser();
    const repo = await getServiceRepository();
    const customer = await repo.createCustomerFromReferral(id, user.name);
    revalidateReferrals();
    return { ok: true as const, customerId: customer.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 紹介報酬(初期費用の25%)の状況を更新する。
 * 金額は初期費用から計算し直すため、初期費用が変わっても取り違えない。
 */
export async function setReferralRewardStatusAction(
  id: string,
  status: "pending" | "payable" | "paid",
) {
  try {
    await requireReferralUser();
    const repo = await getServiceRepository();
    const referral = await repo.getReferral(id);
    if (!referral) throw new Error("紹介が見つかりません");
    if (status !== "pending" && referral.rewardBaseAmount <= 0) {
      throw new Error(
        "初期費用がまだ確定していません。紹介された方の初回請求を作成すると自動で金額が入ります",
      );
    }
    await repo.setReferralReward(id, {
      rewardBaseAmount: referral.rewardBaseAmount,
      rewardAmount: referralReward(referral.rewardBaseAmount),
      status,
    });
    revalidateReferrals();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
