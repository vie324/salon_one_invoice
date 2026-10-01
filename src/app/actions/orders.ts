"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { MandateInput } from "@/lib/data/repository";
import { canAccessBilling } from "@/lib/domain/constants";
import type { ManualChecklistKey } from "@/lib/domain/onboarding";
import { confirmOrder } from "@/lib/orders/confirm";
import { toISODate } from "@/lib/utils";

/**
 * 受注管理(申込・契約 → 受注確認 → 導入準備 → 運用中)の操作。
 * 請求管理の権限(管理者・請求管理者)が必要。
 */

async function requireOrderUser() {
  const user = await requireActionUser();
  if (!canAccessBilling(user.roles)) throw new Error("受注管理へのアクセス権限がありません");
  return user;
}

function revalidateOrder(customerId?: string) {
  revalidatePath("/orders");
  revalidatePath("/home");
  revalidatePath("/dashboard");
  if (customerId) {
    revalidatePath(`/orders/${customerId}`);
    revalidatePath(`/customers/${customerId}`);
  }
}

/** 顧客の案件カードを取得(無ければ作られる) */
async function cardFor(customerId: string) {
  const repo = await getServiceRepository();
  const card = (await repo.listOnboardings()).find((o) => o.customerId === customerId);
  if (!card) throw new Error("案件が見つかりません");
  return { repo, card };
}

/**
 * 受注確定。締結済みの契約から、初回請求書(初期費用＋初月日割り)と毎月の請求(定期契約)を作る。
 * 紹介特典・代理店報酬もここで確定する。
 */
export async function confirmOrderAction(
  contractId: string,
  params: { startedOn: string; emailInvoice: boolean },
) {
  try {
    const user = await requireOrderUser();
    const repo = await getServiceRepository();
    const res = await confirmOrder({
      repo,
      contractId,
      startedOn: params.startedOn,
      actor: user.name,
      emailInvoice: params.emailInvoice,
    });
    if (!res.ok) return res;
    revalidateOrder(res.customerId);
    revalidatePath(`/contracts/${contractId}`);
    revalidatePath("/contracts");
    revalidatePath("/invoices");
    revalidatePath("/subscriptions");
    revalidatePath("/agencies");
    revalidatePath("/referrals");
    return res;
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 手で付けるチェック(申込内容の確認・初回請求書の送付・初期設定など)のオン/オフ */
export async function toggleOrderChecklistAction(
  customerId: string,
  key: ManualChecklistKey,
  done: boolean,
) {
  try {
    const user = await requireOrderUser();
    const { repo, card } = await cardFor(customerId);
    await repo.updateOnboarding(card.id, { checklist: [{ key, done }], actor: user.name });
    revalidateOrder(customerId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** フォロー期日・次にやることのメモ */
export async function updateOrderNoteAction(
  customerId: string,
  input: { dueDate: string | null; nextAction: string },
) {
  try {
    const user = await requireOrderUser();
    const { repo, card } = await cardFor(customerId);
    await repo.updateOnboarding(card.id, {
      dueDate: input.dueDate || null,
      nextAction: input.nextAction,
      actor: user.name,
    });
    revalidateOrder(customerId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 休止・解約・見送りにする / 戻す。
 * 戻すとステージは実データから自動で決め直される。
 */
export async function setOrderClosedAction(customerId: string, closed: boolean, reason?: string) {
  try {
    const user = await requireOrderUser();
    const { repo, card } = await cardFor(customerId);
    await repo.updateOnboarding(card.id, {
      // 戻すときは仮に「申込・契約」へ置き、次の表示で実データのステージに合わせる
      stage: closed ? "closed" : "application",
      actor: user.name,
      ...(closed && reason?.trim()
        ? { nextAction: `【${toISODate(new Date())} 休止・見送り】${reason.trim()}` }
        : {}),
    });
    revalidateOrder(customerId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 口座振替(NSS)の手続きの1ステップを記録する */
export type NssStep =
  | "form_sent"
  | "form_received"
  | "submitted"
  | "registered"
  | "rejected"
  | "revoked"
  | "reset";

export async function recordNssStepAction(
  customerId: string,
  step: NssStep,
  params: {
    date?: string;
    debitStartMonth?: string | null;
    nssCustomerNumber?: string;
    note?: string;
  } = {},
) {
  try {
    await requireOrderUser();
    const repo = await getServiceRepository();
    const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : toISODate(new Date());
    let input: MandateInput;
    switch (step) {
      case "form_sent":
        input = { formSentOn: date };
        break;
      case "form_received":
        input = { formReceivedOn: date };
        break;
      case "submitted":
        // 不備で差し戻された後の再提出もここ(手続き中に戻す)
        input = { nssSubmittedOn: date, status: "pending" };
        break;
      case "registered":
        if (params.debitStartMonth && !/^\d{4}-\d{2}$/.test(params.debitStartMonth)) {
          throw new Error("振替開始月は YYYY-MM の形で指定してください");
        }
        input = {
          status: "active",
          registeredAt: date,
          debitStartMonth: params.debitStartMonth ?? null,
          ...(params.nssCustomerNumber !== undefined
            ? { nssCustomerNumber: params.nssCustomerNumber }
            : {}),
        };
        break;
      case "rejected":
        input = { status: "failed", note: params.note ?? "" };
        break;
      case "revoked":
        input = { status: "revoked", note: params.note ?? "" };
        break;
      case "reset":
        input = {
          status: "pending",
          registeredAt: null,
          formSentOn: null,
          formReceivedOn: null,
          nssSubmittedOn: null,
          debitStartMonth: null,
        };
        break;
    }
    if (params.note !== undefined && step !== "rejected" && step !== "revoked") {
      input.note = params.note;
    }
    await repo.upsertMandate(customerId, input);
    revalidateOrder(customerId);
    revalidatePath("/direct-debit");
    revalidatePath("/customers");
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 旧運用で保存した口座情報(口座番号など)を消去する。NSS で管理しているため不要。 */
export async function clearLegacyBankInfoAction(customerId: string) {
  try {
    await requireOrderUser();
    const repo = await getServiceRepository();
    await repo.upsertMandate(customerId, {
      bankName: "",
      branchName: "",
      branchCode: "",
      accountNumber: "",
      accountHolderKana: "",
    });
    revalidateOrder(customerId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
