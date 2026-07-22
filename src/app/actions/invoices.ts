"use server";

import { revalidatePath } from "next/cache";
import { getServiceRepository } from "@/lib/data";
import type { InvoiceInput } from "@/lib/data/repository";
import { getEmailProvider } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/email/templates";
import type { InvoiceStatus } from "@/lib/domain/types";

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
