"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { InvoiceInput } from "@/lib/data/repository";
import { getEmailProvider } from "@/lib/email";
import { invoiceEmailHtml, paymentReminderEmailHtml } from "@/lib/email/templates";
import { paymentMethodLabels } from "@/lib/domain/constants";
import type { InvoiceStatus, PaymentMethod } from "@/lib/domain/types";
import { daysUntil } from "@/lib/utils";

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

export async function sendInvoiceAction(id: string, options?: { email?: boolean }) {
  try {
    const repo = await getServiceRepository();
    const inv = await repo.sendInvoice(id);
    let emailResult: string | null = null;
    if (options?.email) {
      const full = await repo.getInvoice(id);
      const org = await repo.getOrganization();
      if (full?.customer?.email) {
        const res = await getEmailProvider().send({
          to: full.customer.email,
          subject: `【${org.name}】請求書 ${inv.invoiceNumber} のご案内`,
          html: invoiceEmailHtml({
            invoice: full,
            customerName: full.customer.name,
            org,
          }),
        });
        emailResult = res.ok ? res.message ?? "送信しました" : `送信失敗: ${res.message}`;
      } else {
        emailResult = "顧客のメールアドレスが未登録です";
      }
    }
    revalidateInvoiceViews();
    revalidatePath(`/invoices/${id}`);
    return { ok: true as const, emailResult };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 入金督促(リマインド)メールを送付し、督促回数・最終送付日時を記録する。
 * 送付済〜期限超過の未入金請求が対象。行き違いに配慮した文面で送る。
 */
export async function sendPaymentReminderAction(id: string) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    const inv = await repo.getInvoice(id);
    if (!inv) return { ok: false as const, error: "請求書が見つかりません" };
    if (["paid", "canceled", "draft"].includes(inv.status)) {
      return { ok: false as const, error: "この請求書は督促の対象ではありません" };
    }
    if (!inv.customer?.email) {
      return { ok: false as const, error: "顧客のメールアドレスが未登録です" };
    }
    const org = await repo.getOrganization();
    const res = await getEmailProvider().send({
      to: inv.customer.email,
      subject: `【${org.name}】請求書 ${inv.invoiceNumber} お支払いのご確認`,
      html: paymentReminderEmailHtml({
        invoice: inv,
        customerName: inv.customer.name,
        org,
        overdueDays: -daysUntil(inv.dueDate),
      }),
    });
    if (!res.ok) {
      return { ok: false as const, error: `メール送信失敗: ${res.message}` };
    }
    const updated = await repo.recordInvoiceReminder(id, { actor: user.name });
    revalidateInvoiceViews();
    revalidatePath(`/invoices/${id}`);
    return {
      ok: true as const,
      emailResult:
        res.message ?? `督促メールを送信しました（${updated.reminderCount ?? 1}回目）`,
    };
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
