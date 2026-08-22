"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { InvoiceInput } from "@/lib/data/repository";
import { getEmailProvider } from "@/lib/email";
import { invoiceEmailHtml, paymentReminderEmailHtml } from "@/lib/email/templates";
import type { InvoiceStatus } from "@/lib/domain/types";
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
