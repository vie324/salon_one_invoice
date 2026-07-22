"use server";

import { revalidatePath } from "next/cache";
import { getServiceRepository } from "@/lib/data";
import type { AgencyInput, AgencyMemberInput } from "@/lib/data/repository";
import { computeAgencyStatement } from "@/lib/domain/agency";
import { getEmailProvider } from "@/lib/email";
import { agencyStatementEmailHtml } from "@/lib/email/templates";

function revalidateAgencyViews(id?: string) {
  revalidatePath("/agencies");
  if (id) revalidatePath(`/agencies/${id}`);
}

export async function createAgencyAction(input: AgencyInput) {
  try {
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
    const repo = await getServiceRepository();
    await repo.updateAgencyMember(id, input);
    revalidateAgencyViews(agencyId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 対象月の支払明細を計算し、代理店のメールアドレスへ送付する。 */
export async function sendAgencyStatementAction(agencyId: string, month: string) {
  try {
    const repo = await getServiceRepository();
    const agency = await repo.getAgency(agencyId);
    if (!agency) return { ok: false as const, error: "代理店が見つかりません" };
    if (!agency.email) {
      return { ok: false as const, error: "代理店のメールアドレスが未登録です。代理店情報を編集して設定してください。" };
    }
    const [members, customers, invoices, org] = await Promise.all([
      repo.listAgencyMembers(agencyId),
      repo.listCustomers(),
      repo.listInvoices(),
      repo.getOrganization(),
    ]);
    const statement = computeAgencyStatement({ agency, members, customers, invoices, month });
    const [y, m] = month.split("-");
    const res = await getEmailProvider().send({
      to: agency.email,
      subject: `【${org.name}】${y}年${Number(m)}月分 支払明細のご案内（${agency.name} 様）`,
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
