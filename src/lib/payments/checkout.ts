import type Stripe from "stripe";
import type { Customer } from "@/lib/domain/types";
import { getStripe } from "./stripe-client";

/**
 * Stripe 顧客を取得（無ければ作成）。
 * JPY は zero-decimal 通貨なので金額は「円」をそのまま渡す。
 */
export async function getOrCreateStripeCustomer(customer: Customer): Promise<string> {
  const stripe = getStripe();
  if (customer.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(customer.stripeCustomerId);
      if (existing && !("deleted" in existing && existing.deleted)) {
        return customer.stripeCustomerId;
      }
    } catch {
      // 見つからなければ作り直す
    }
  }
  const created = await stripe.customers.create({
    name: customer.name,
    email: customer.email || undefined,
    metadata: { appCustomerId: customer.id, code: customer.code },
  });
  return created.id;
}

export interface CheckoutParams {
  stripeCustomerId: string;
  appCustomerId: string;
  planName: string;
  monthlyAmount: number;
  initialFee: number;
  origin: string;
}

/**
 * サブスク + 初期費用(単発)を 1 回の Checkout でまとめて課金するセッションを作成。
 * 初期費用は subscription の初回請求書に加算される。
 */
export async function createSubscriptionCheckout(
  params: CheckoutParams,
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: "jpy",
        product_data: { name: params.planName },
        unit_amount: params.monthlyAmount,
        recurring: { interval: "month" },
      },
      quantity: 1,
    },
  ];

  if (params.initialFee > 0) {
    line_items.push({
      price_data: {
        currency: "jpy",
        product_data: { name: "初期費用" },
        unit_amount: params.initialFee,
      },
      quantity: 1,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: params.stripeCustomerId,
    client_reference_id: params.appCustomerId,
    line_items,
    subscription_data: {
      metadata: { appCustomerId: params.appCustomerId, planName: params.planName },
    },
    metadata: {
      appCustomerId: params.appCustomerId,
      planName: params.planName,
      initialFee: String(params.initialFee),
      monthly: String(params.monthlyAmount),
    },
    success_url: `${params.origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${params.origin}/billing/cancel`,
  });

  if (!session.url) throw new Error("Checkout セッションのURL取得に失敗しました");
  return { url: session.url, sessionId: session.id };
}
