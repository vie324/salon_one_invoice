import { paymentProvider } from "@/lib/config";
import { ManualPaymentProvider } from "./manual";
import type { PaymentProvider } from "./provider";
import { StripePaymentProvider } from "./stripe";

let cached: PaymentProvider | null = null;

/** 設定に応じた決済プロバイダを返す。 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;
  if (paymentProvider === "stripe") {
    cached = new StripePaymentProvider(process.env.STRIPE_SECRET_KEY ?? "");
  } else {
    cached = new ManualPaymentProvider();
  }
  return cached;
}

export type { PaymentProvider, ChargeParams, ChargeResult } from "./provider";
