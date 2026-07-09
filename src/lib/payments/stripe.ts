import type { ChargeParams, ChargeResult, PaymentProvider } from "./provider";

/**
 * Stripe 参考実装。SDK 非依存で REST API を直接叩く(要 STRIPE_SECRET_KEY)。
 * カード/口座引き落とし(対応リージョン)の PaymentIntent を作成する。
 * 日本の口座振替(収納代行)を使う場合は別アダプタを用意すること。
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  constructor(private secretKey: string) {}

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    if (!this.secretKey) {
      return { status: "failed", providerRef: "", message: "STRIPE_SECRET_KEY 未設定" };
    }
    const body = new URLSearchParams({
      amount: String(params.amount),
      currency: params.currency ?? "jpy",
      confirm: "true",
      "automatic_payment_methods[enabled]": "true",
      description: params.description ?? "請求",
    });
    if (params.customerRef) body.set("customer", params.customerRef);
    if (params.mandateRef) body.set("payment_method", params.mandateRef);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (params.idempotencyKey) headers["Idempotency-Key"] = params.idempotencyKey;

    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers,
      body,
    });
    const json = (await res.json()) as { id?: string; status?: string; error?: { message?: string } };
    if (!res.ok) {
      return { status: "failed", providerRef: "", message: json.error?.message ?? "Stripe error" };
    }
    const succeeded = json.status === "succeeded";
    return {
      status: succeeded ? "succeeded" : json.status === "processing" ? "pending" : "failed",
      providerRef: json.id ?? "",
      message: json.status,
    };
  }
}
