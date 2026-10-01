"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { AgencyInput, AgencyMemberInput } from "@/lib/data/repository";
import { computeAgencyStatement } from "@/lib/domain/agency";
import { canAccessBilling } from "@/lib/domain/constants";
import { getEmailProvider } from "@/lib/email";
import { agencyStatementEmailHtml } from "@/lib/email/templates";
import { toISODate } from "@/lib/utils";

function revalidateAgencyViews(id?: string) {
  revalidatePath("/agencies");
  if (id) revalidatePath(`/agencies/${id}`);
}

/** 代理店を扱えるのは請求管理の権限を持つアカウント(管理者・請求管理者) */
async function requireAgencyUser() {
  const user = await requireActionUser();
  if (!canAccessBilling(user.roles)) throw new Error("代理店へのアクセス権限がありません");
  return user;
}

export async function createAgencyAction(input: AgencyInput) {
  try {
    await requireAgencyUser();
    const repo = await getServiceRepository();
    const agency = await repo.createAgency(input);
    revalidateAgencyViews();
    return { ok: true as const, id: agency.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateAgencyAction(id: string, input: Partial<AgencyInput>) {
  try {
    await requireAgencyUser();
    const repo = await getServiceRepository();
    await repo.updateAgency(id, input);
    revalidateAgencyViews(id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function createAgencyMemberAction(input: AgencyMemberInput) {
  try {
    await requireAgencyUser();
    const repo = await getServiceRepository();
    await repo.createAgencyMember(input);
    revalidateAgencyViews(input.agencyId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateAgencyMemberAction(
  id: string,
  agencyId: string,
  input: Partial<Omit<AgencyMemberInput, "agencyId">>,
) {
  try {
    await requireAgencyUser();
    const repo = await getServiceRepository();
    await repo.updateAgencyMember(id, input);
    revalidateAgencyViews(agencyId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 代理店報酬を支払済みにする / 未払いに戻す。
 * 支払済みにできるのは、お客様の初期費用の入金を確認した(支払対象の)報酬だけ。
 */
export async function setAgencyCommissionsPaidAction(
  agencyId: string,
  ids: string[],
  paid: boolean,
  paidOn?: string,
) {
  try {
    const user = await requireAgencyUser();
    if (ids.length === 0) throw new Error("対象の報酬がありません");
    const repo = await getServiceRepository();
    const date = paidOn && /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? paidOn : toISODate(new Date());
    await repo.setAgencyCommissionsPaid(ids, paid ? date : null, user.name);
    revalidateAgencyViews(agencyId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 対象月の支払明細を計算し、代理店のメールアドレスへ送付する。 */
export async function sendAgencyStatementAction(agencyId: string, month: string) {
  try {
    await requireAgencyUser();
    const repo = await getServiceRepository();
    const agency = await repo.getAgency(agencyId);
    if (!agency) return { ok: false as const, error: "代理店が見つかりません" };
    if (!agency.email) {
      return { ok: false as const, error: "代理店のメールアドレスが未登録です。代理店情報を編集して設定してください。" };
    }
    const [members, customers, invoices, commissions, org] = await Promise.all([
      repo.listAgencyMembers(agencyId),
      repo.listCustomers(),
      repo.listInvoices(),
      repo.listAgencyCommissions({ agencyId }),
      repo.getOrganization(),
    ]);
    const statement = computeAgencyStatement({
      agency,
      members,
      customers,
      invoices,
      commissions,
      month,
    });
    if (statement.lines.length === 0) {
      return { ok: false as const, error: "この月に支払対象になった報酬はありません" };
    }
    const [y, m] = month.split("-");
    const res = await getEmailProvider().send({
      to: agency.email,
      subject: `【${org.name}】${y}年${Number(m)}月分 代理店報酬のご案内（${agency.name} 様）`,
      html: agencyStatementEmailHtml({ statement, org }),
    });
    revalidateAgencyViews(agencyId);
    return {
      ok: true as const,
      emailResult: res.ok
        ? (res.message ?? "支払明細を送信しました")
        : `メール送信失敗: ${res.message}`,
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
