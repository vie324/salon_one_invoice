"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { OrganizationInput } from "@/lib/data/repository";
import { isProductAdmin } from "@/lib/domain/constants";
import type { AccountType } from "@/lib/domain/types";

/** 適格請求書発行事業者の登録番号(T + 13桁)。空 = 未設定。 */
const REGISTRATION_NUMBER = /^T\d{13}$/;

const ACCOUNT_TYPES: AccountType[] = ["普通", "当座"];

/**
 * 自社情報を検証して正規化する。
 * 請求書・請求書メールにそのまま記載されるため、桁数や形式の誤りは
 * 保存前に弾く(誤った登録番号は適格請求書として無効になるため)。
 */
function validate(input: OrganizationInput): OrganizationInput {
  const trim = (v: string) => (v ?? "").trim();
  const name = trim(input.name);
  if (!name) throw new Error("事業者名を入力してください");

  const registrationNumber = trim(input.registrationNumber).toUpperCase();
  if (registrationNumber && !REGISTRATION_NUMBER.test(registrationNumber)) {
    throw new Error("登録番号は「T」＋数字13桁で入力してください（例: T2010801037576）");
  }

  const invoicePrefix = trim(input.invoicePrefix) || "INV";
  if (!/^[A-Za-z0-9-]+$/.test(invoicePrefix)) {
    throw new Error("請求書番号の接頭辞は半角英数字とハイフンで入力してください");
  }

  const bankBranchCode = trim(input.bankBranchCode);
  if (bankBranchCode && !/^\d{1,4}$/.test(bankBranchCode)) {
    throw new Error("支店番号は数字で入力してください（例: 106）");
  }

  const defaultTaxRate = Number(input.defaultTaxRate);
  if (!Number.isFinite(defaultTaxRate) || defaultTaxRate < 0 || defaultTaxRate > 1) {
    throw new Error("既定税率は 0〜1 の小数で指定してください（10% = 0.1）");
  }

  const bankAccountType = ACCOUNT_TYPES.includes(input.bankAccountType)
    ? input.bankAccountType
    : "普通";

  return {
    name,
    postalCode: trim(input.postalCode),
    address: trim(input.address),
    tel: trim(input.tel),
    email: trim(input.email),
    registrationNumber,
    bankName: trim(input.bankName),
    bankBranch: trim(input.bankBranch),
    bankBranchCode,
    bankAccountType,
    bankAccountNumber: trim(input.bankAccountNumber),
    bankAccountHolder: trim(input.bankAccountHolder),
    invoicePrefix,
    defaultTaxRate,
  };
}

/**
 * 自社情報(請求書の発行元)の更新。管理者のみ。
 * 電話番号・インボイス登録番号・振込先は請求書と請求書メールに記載されるため、
 * 保存後は請求書まわりの画面をまとめて再検証する。
 */
export async function updateOrganizationAction(input: OrganizationInput) {
  try {
    const user = await requireActionUser();
    if (!isProductAdmin(user.roles)) {
      throw new Error("自社情報の変更は管理者のみ可能です");
    }
    const repo = await getServiceRepository();
    await repo.updateOrganization(validate(input));
    revalidatePath("/settings");
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    revalidatePath("/agencies");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
