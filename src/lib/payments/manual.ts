import type { ChargeParams, ChargeResult, PaymentProvider } from "./provider";

/**
 * 手動 / 収納代行前提のプロバイダ。
 * 請求はいったん「入金待ち」とし、口座振替バッチ・手動入金確認・
 * 銀行明細CSVの照合で確定させる。自動与信は行わない。
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly name = "manual";

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    return {
      status: "pending",
      providerRef: params.idempotencyKey ?? "manual",
      message: "手動確認/口座振替バッチで消し込みます",
    };
  }
}
