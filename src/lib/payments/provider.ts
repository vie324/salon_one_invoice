/**
 * 決済プロバイダ抽象。
 * 「原則 引き落とし(口座振替)」を軸にしつつ、プロバイダ非依存で差し替え可能にする。
 *
 *  - manual : 自動連携なし。請求は「入金待ち」となり、口座振替バッチや
 *             手動入金確認 / 銀行明細CSV照合で消し込む(初期費用の振込確認にも対応)。
 *  - stripe : Stripe を利用する参考実装(要 STRIPE_SECRET_KEY)。
 *
 * 日本の口座振替(収納代行: GMO / SMBC 等)を使う場合は、この interface を実装した
 * アダプタを追加し、getPaymentProvider() の分岐に足すだけでよい。
 */

export interface ChargeParams {
  amount: number;
  currency?: string;
  /** 顧客の外部参照(Stripe customer id 等) */
  customerRef?: string;
  /** 口座振替マンデート等の参照 */
  mandateRef?: string;
  description?: string;
  idempotencyKey?: string;
}

export interface ChargeResult {
  status: "succeeded" | "pending" | "failed";
  providerRef: string;
  message?: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** 支払いを実行/依頼する。manual は pending を返し人手/バッチで確定させる。 */
  createCharge(params: ChargeParams): Promise<ChargeResult>;
}
