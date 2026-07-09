import Stripe from "stripe";

let cached: Stripe | null = null;

/** STRIPE_SECRET_KEY が設定済みか */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** テストキー(sk_test_)かどうか */
export function isStripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

/** 設定済みの Stripe クライアントを返す。未設定なら例外。 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY が未設定です");
  // apiVersion は SDK 同梱の既定(アカウント設定)を使用
  if (!cached) cached = new Stripe(key);
  return cached;
}
