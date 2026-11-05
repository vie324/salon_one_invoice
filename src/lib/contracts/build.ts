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
import { feeTablesFromSelection, termsFromSelection } from "@/lib/domain/pricing";

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

/**
 * プラン選択から申込条件(構造化)を作る。
 * 申込・契約URLと同じ計算(初期費用・月額とも1店舗あたり、店舗数による割引を含む)。
 */
export function termsFromPlan(
  plan: Plan,
  optionKeys: string[],
  storeCount: number,
  startDate: string | null,
): ContractTerms {
  return termsFromSelection({ plan, optionKeys, storeCount }, startDate);
}

/** プラン選択から契約書の個別料金表(別表)を生成する(申込・契約URLと同じ料金表) */
export function feeTablesFromPlan(
  plan: Plan,
  optionKeys: string[],
  storeCount: number,
): ContractFeeTable[] {
  return feeTablesFromSelection({ plan, optionKeys, storeCount });
}

/**
 * 公開署名ページ(社外の契約者)へ渡す契約データのサニタイズ。
 * 社内CRM情報(customer: メモ・担当者等)とアクセスコードを除去する。
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
    deliveryMethod === "form"
      ? "申込・契約URLのフォームで契約内容を提示(お客様がご自身で申込内容を入力・確認)"
      : deliveryMethod === "link"
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
