"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { InvoiceInput, InvoiceItemInput } from "@/lib/data/repository";
import { canAccessBilling, paymentMethodLabels } from "@/lib/domain/constants";
import { syncPayoutsWithInitialInvoice } from "@/lib/orders/initial-fee-sync";
import type { InvoiceStatus, PaymentMethod } from "@/lib/domain/types";

function revalidateInvoiceViews() {
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  revalidatePath("/direct-debit");
  revalidatePath("/payments");
}

export async function createInvoiceAction(input: InvoiceInput) {
  try {
    const repo = await getServiceRepository();
    const inv = await repo.createInvoice(input);
    revalidateInvoiceViews();
    return { ok: true as const, id: inv.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 修正の理由の長さの上限(修正履歴に残す) */
const REVISION_REASON_MAX = 200;

/**
 * 明細の修正(入金前・NSS引き落としの一覧に入っていない請求書だけ)。
 * 直す前の明細・金額は修正履歴として残す(理由は必須)。
 * 初回請求書なら、その初期費用から計算した代理店報酬・紹介謝礼も新しい金額に合わせる(支払済みは除く)。
 */
export async function updateInvoiceItemsAction(
  id: string,
  input: { items: InvoiceItemInput[]; notes?: string; reason: string },
) {
  try {
    const user = await requireActionUser();
    if (!canAccessBilling(user.roles)) throw new Error("請求管理の権限がありません");
    const reason = String(input.reason ?? "").trim();
    if (!reason) throw new Error("修正の理由を入れてください（修正履歴に残ります）");
    if (reason.length > REVISION_REASON_MAX) {
      throw new Error(`修正の理由は${REVISION_REASON_MAX}文字以内で入れてください`);
    }
    const repo = await getServiceRepository();
    const updated = await repo.updateInvoiceItems(id, {
      items: input.items,
      notes: input.notes,
      reason,
      actor: user.name,
    });
    const notes = await syncPayoutsWithInitialInvoice(repo, updated);
    revalidateInvoiceViews();
    revalidatePath(`/invoices/${id}`);
    revalidatePath(`/orders/${updated.customerId}`);
    revalidatePath(`/customers/${updated.customerId}`);
    revalidatePath("/signups");
    revalidatePath("/agencies");
    revalidatePath("/referrals");
    return { ok: true as const, notes };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 支払方法の変更(口座振替 ⇔ 銀行振込 など)。
 * 請求書の「お支払い方法」欄と案内文(引き落とし予定 / お振込先)が切り替わる。
 * 引き落とし予定として口座振替バッチに登録済みの請求は、二重請求を避けるため変更しない。
 */
export async function updateInvoicePaymentMethodAction(id: string, paymentMethod: PaymentMethod) {
  try {
    await requireActionUser();
    const repo = await getServiceRepository();
    const inv = await repo.getInvoice(id);
    if (!inv) return { ok: false as const, error: "請求書が見つかりません" };
    if (inv.paymentMethod === paymentMethod) return { ok: true as const, message: null };
    if (inv.status === "paid" || inv.status === "canceled") {
      return { ok: false as const, error: "入金済・取消の請求書は支払方法を変更できません" };
    }
    const batches = await repo.listBatches();
    const inPendingBatch = batches.some((b) =>
      b.items.some((it) => it.invoiceId === id && it.result === "pending"),
    );
    if (inPendingBatch) {
      return {
        ok: false as const,
        error:
          "口座振替バッチに登録済みのため変更できません。バッチの処理後に変更してください。",
      };
    }
    await repo.updateInvoicePaymentMethod(id, paymentMethod);
    revalidateInvoiceViews();
    revalidatePath(`/invoices/${id}`);
    revalidatePath(`/customers/${inv.customerId}`);
    return {
      ok: true as const,
      message: `支払方法を「${paymentMethodLabels[paymentMethod]}」に変更しました`,
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 下書きを「送付済」にする(お客様へは PDF を保存して渡す。メールは送らない)。 */
export async function sendInvoiceAction(id: string) {
  try {
    const repo = await getServiceRepository();
    await repo.sendInvoice(id);
    revalidateInvoiceViews();
    revalidatePath(`/invoices/${id}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function updateInvoiceStatusAction(id: string, status: InvoiceStatus) {
  try {
    const repo = await getServiceRepository();
    await repo.updateInvoiceStatus(id, status);
    revalidateInvoiceViews();
    revalidatePath(`/invoices/${id}`);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

export async function runRecurringBillingAction() {
  try {
    const repo = await getServiceRepository();
    const { created } = await repo.runRecurringBilling();
    revalidateInvoiceViews();
    revalidatePath("/subscriptions");
    return { ok: true as const, count: created.length };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
