"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getRepository } from "@/lib/data";
import { createSubscriptionCheckout, getOrCreateStripeCustomer } from "@/lib/payments/checkout";
import { isStripeConfigured } from "@/lib/payments/stripe-client";
import { genId, toISODate } from "@/lib/utils";

export interface BillingOptions {
  planName: string;
  monthlyAmount: number;
  initialFee: number;
}

function revalidateBillingViews(customerId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/invoices");
  revalidatePath("/subscriptions");
  revalidatePath("/payments");
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
}

/** Stripe Checkout（サブスク＋初期費用）を開始し、リダイレクト先URLを返す。 */
export async function startBillingCheckoutAction(customerId: string, opts: BillingOptions) {
  try {
    if (!isStripeConfigured()) {
      return {
        ok: false as const,
        error: "STRIPE_SECRET_KEY が未設定です。テスト用シミュレートをご利用ください。",
      };
    }
    const repo = await getRepository();
    const customer = await repo.getCustomer(customerId);
    if (!customer) return { ok: false as const, error: "顧客が見つかりません" };

    const stripeCustomerId = await getOrCreateStripeCustomer(customer);
    await repo.linkStripeCustomer(customerId, stripeCustomerId);

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const origin = `${proto}://${host}`;

    const { url } = await createSubscriptionCheckout({
      stripeCustomerId,
      appCustomerId: customerId,
      planName: opts.planName,
      monthlyAmount: opts.monthlyAmount,
      initialFee: opts.initialFee,
      origin,
    });
    return { ok: true as const, url };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * テスト用: Stripe キー無しで「初期費用＋初月の決済成功」を再現し、
 * 定期課金・請求・入金の管理フローを即座に確認できるようにする。
 */
export async function simulateBillingAction(customerId: string, opts: BillingOptions) {
  try {
    const repo = await getRepository();
    const customer = await repo.getCustomer(customerId);
    if (!customer) return { ok: false as const, error: "顧客が見つかりません" };

    const fakeCustomer = customer.stripeCustomerId ?? `cus_sim_${genId("")}`;
    await repo.linkStripeCustomer(customerId, fakeCustomer);
    const subId = `sub_sim_${genId("")}`;
    await repo.upsertStripeSubscription({
      customerId,
      stripeSubscriptionId: subId,
      planName: opts.planName,
      amount: opts.monthlyAmount,
      status: "active",
    });

    const today = toISODate(new Date());
    const period = today.slice(0, 7);
    await repo.recordStripeInvoice({
      externalId: `in_sim_${genId("")}`,
      stripeCustomerId: fakeCustomer,
      status: "paid",
      type: "initial",
      billingPeriod: period,
      issueDate: today,
      lines: [
        ...(opts.initialFee > 0 ? [{ description: "初期費用", amount: opts.initialFee }] : []),
        { description: `${opts.planName}（${period}）`, amount: opts.monthlyAmount },
      ],
      total: opts.initialFee + opts.monthlyAmount,
      paidAt: today,
    });

    revalidateBillingViews(customerId);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
