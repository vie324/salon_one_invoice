"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireActionUser } from "@/lib/auth";
import { appUrl } from "@/lib/config";
import { getJobRepository, getServiceRepository } from "@/lib/data";
import type { ApplicationInput } from "@/lib/data/repository";
import { toCredential } from "@/lib/domain/application";
import { APPLICATION_LINK_EXPIRY_DAYS, canAccessBilling } from "@/lib/domain/constants";
import type { ApplicationStatus } from "@/lib/domain/types";

function revalidateApplications(id?: string) {
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/applications/${id}`);
}

/** 申込を扱えるのは請求管理の権限を持つアカウント(全体管理者・請求管理) */
async function requireApplicationUser() {
  const user = await requireActionUser();
  if (!canAccessBilling(user.role)) {
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

/** 申込URLを発行する。 */
export async function createApplicationLinkAction(input: {
  name: string;
  expiryDays?: number;
}) {
  try {
    const user = await requireApplicationUser();
    if (!input.name.trim()) throw new Error("URLの名前(宛先メモ)を入力してください");
    const repo = await getServiceRepository();
    const link = await repo.createApplicationLink({
      name: input.name,
      expiryDays: input.expiryDays ?? APPLICATION_LINK_EXPIRY_DAYS,
      createdBy: user.name,
    });
    revalidateApplications();
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
    if (!companyName) throw new Error("法人名(個人の場合は個人名)を入力してください");
    if (!input.address.trim()) throw new Error("住所を入力してください");
    if (!input.representativeName.trim()) throw new Error("代表者名を入力してください");

    const h = await headers();
    const forwarded = h.get("x-forwarded-for") ?? "";
    const payload: ApplicationInput = {
      companyName,
      address: input.address,
      representativeTitle: input.representativeTitle,
      representativeName: input.representativeName,
      hotpepper: toCredential(input.hotpepperId, input.hotpepperPassword),
      minimo: toCredential(input.minimoId, input.minimoPassword),
      epark: toCredential(input.eparkId, input.eparkPassword),
      lineRequested: input.lineRequested,
      submittedIp: forwarded.split(",")[0]?.trim() || h.get("x-real-ip") || "",
    };

    const repo = await getJobRepository();
    await repo.submitApplication(token, payload);
    revalidateApplications();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
