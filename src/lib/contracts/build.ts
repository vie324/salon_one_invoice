import type {
  Contract,
  ContractDeliveryMethod,
  ContractFeeTable,
  ContractParty,
  ContractStatus,
  ContractTerms,
  ContractWithCustomer,
  Customer,
  Plan,
} from "@/lib/domain/types";
import { selectedOptions, subscriptionMonthly } from "@/lib/domain/calculations";
import { formatNumber } from "@/lib/utils";

/** 顧客レコードから乙(契約者)スナップショットを作る */
export function partyFromCustomer(customer: Customer): ContractParty {
  return {
    name: customer.name,
    postalCode: customer.postalCode,
    address: customer.address,
    representative: customer.contactName,
    email: customer.email,
  };
}

/** プラン選択から申込条件(構造化)を作る */
export function termsFromPlan(
  plan: Plan,
  optionKeys: string[],
  storeCount: number,
  startDate: string | null,
): ContractTerms {
  return {
    planId: plan.id,
    planName: `${plan.name}（${plan.term === "annual" ? "年間" : "月額"}）`,
    optionKeys,
    storeCount,
    initialFee: plan.initialFee,
    monthlyFee: subscriptionMonthly(plan, optionKeys) * storeCount,
    startDate,
    notes: "",
  };
}

/** プラン選択から契約書の個別料金表(別表)を生成する */
export function feeTablesFromPlan(
  plan: Plan,
  optionKeys: string[],
  storeCount: number,
): ContractFeeTable[] {
  const rows = [
    { item: "初期構築費用", amount: `${formatNumber(plan.initialFee)}円` },
    {
      item: "月額利用料",
      amount: `${formatNumber(plan.amount)}円（1店舗あたり）`,
    },
    ...selectedOptions(plan, optionKeys).map((o) => ({
      item: `オプション: ${o.name}`,
      amount: `${formatNumber(o.monthly)}円（月額・1店舗あたり）`,
    })),
    { item: "契約店舗数", amount: `${storeCount}店舗` },
    {
      item: "月額合計（税別）",
      amount: `${formatNumber(subscriptionMonthly(plan, optionKeys) * storeCount)}円`,
    },
  ];
  return [
    {
      title: `■ お申込みプラン: ${plan.name}（${plan.term === "annual" ? "年間" : "月額"}・税別）`,
      rows,
    },
  ];
}

/**
 * 公開署名ページ(社外の契約者)へ渡す契約データのサニタイズ。
 * 社内CRM情報(customer: メモ・担当者・Stripe ID等)とアクセスコードを除去する。
 * 契約書の書面に必要な情報は customerParty スナップショットに全て含まれる。
 */
export function sanitizeContractForSigner(
  c: Contract | ContractWithCustomer,
): Contract {
  const { customer: _customer, ...rest } = c as ContractWithCustomer;
  return { ...rest, accessCode: null };
}

/**
 * 署名依頼の証跡に残す説明文。
 * メール送付かリンク発行(メールなし)かで、どう渡したかを追えるようにする。
 */
export function contractSendDetail(params: {
  deliveryMethod: ContractDeliveryMethod;
  signerEmail: string;
  hasAccessCode: boolean;
  isResend: boolean;
}): string {
  const { deliveryMethod, signerEmail, hasAccessCode, isResend } = params;
  const head =
    deliveryMethod === "link"
      ? `署名リンクを${isResend ? "再発行" : "発行"}(メール送信なし)`
      : `署名依頼を${isResend ? "再送信(トークン再発行)" : "メールで送付"}`;
  const to = signerEmail ? `: ${signerEmail}` : "";
  return `${head}${to}${hasAccessCode ? " / アクセスコードあり" : ""}`;
}

/**
 * 表示用の実効ステータス。
 * 署名待ち・閲覧済のまま署名期限を過ぎた契約は expired とみなす(保存値は不変)。
 */
export function effectiveContractStatus(
  c: Pick<Contract, "status" | "expiresAt">,
  asOf = new Date(),
): ContractStatus {
  if (
    (c.status === "sent" || c.status === "viewed") &&
    c.expiresAt &&
    new Date(c.expiresAt).getTime() < asOf.getTime()
  ) {
    return "expired";
  }
  return c.status;
}
