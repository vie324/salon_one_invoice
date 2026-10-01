import type { ContractInput } from "@/lib/data/repository";
import { feeTablesFromSelection, termsFromSelection, type OrderSelection } from "@/lib/domain/pricing";
import type {
  Contract,
  ContractParty,
  ContractTemplate,
  Organization,
} from "@/lib/domain/types";

/**
 * 申込・契約URLの入力から契約書の中身を組み立てる(純粋関数)。
 *
 * お客様がフォームで確認する契約書(プレビュー)と、送信後にサーバーで作る契約書は
 * どちらもこの関数で作るので、確認した内容と締結した内容が食い違わない。
 * サーバー側では、ブラウザから送られた契約文面は使わず、必ずここで作り直す。
 */

/** お客様がフォームに入力する契約者情報 */
export interface OrderCustomerInfo {
  /** 法人名(個人の場合は個人名) */
  companyName: string;
  /** 住所(法人の場合は登記住所) */
  address: string;
  representativeTitle: string;
  representativeName: string;
  email: string;
}

export type OrderTemplate = Pick<
  ContractTemplate,
  "id" | "version" | "docTitle" | "preamble" | "sections" | "providerDefault"
>;

/** 甲(自社)の記載。テンプレートの既定値を自社情報で補う */
export function providerFromTemplate(
  template: Pick<ContractTemplate, "providerDefault">,
  org: Pick<Organization, "name" | "postalCode" | "address" | "email">,
): ContractParty {
  const d = template.providerDefault;
  return {
    name: d.name || org.name,
    postalCode: d.postalCode || org.postalCode,
    address: d.address || org.address,
    representative: d.representative,
    email: d.email || org.email,
  };
}

/** 乙(お客様)の記載。署名欄には代表者(役職つき)を記載する */
export function partyFromOrder(info: OrderCustomerInfo): ContractParty {
  return {
    name: info.companyName.trim(),
    postalCode: "",
    address: info.address.trim(),
    representative: [info.representativeTitle.trim(), info.representativeName.trim()]
      .filter(Boolean)
      .join("　"),
    email: info.email.trim(),
  };
}

/** 契約書の作成入力(顧客ID・作成者を除く) */
export function buildOrderContract(params: {
  template: OrderTemplate;
  org: Pick<Organization, "name" | "postalCode" | "address" | "email">;
  info: OrderCustomerInfo;
  selection: OrderSelection;
}): Omit<ContractInput, "customerId" | "createdBy"> {
  const { template, org, info, selection } = params;
  return {
    templateId: template.id,
    templateVersion: template.version,
    title: template.docTitle,
    preamble: template.preamble,
    provider: providerFromTemplate(template, org),
    customerParty: partyFromOrder(info),
    sections: template.sections,
    feeTables: feeTablesFromSelection(selection),
    terms: termsFromSelection(selection, null),
  };
}

/** お客様に見せるプレビュー用の契約書(番号・署名欄は送信後に確定する) */
export function previewOrderContract(
  draft: Omit<ContractInput, "customerId" | "createdBy">,
): Contract {
  const now = new Date().toISOString();
  return {
    id: "preview",
    contractNumber: "（お申込み後に採番されます）",
    customerId: "",
    templateId: draft.templateId ?? null,
    templateVersion: draft.templateVersion ?? null,
    title: draft.title,
    preamble: draft.preamble ?? "",
    status: "draft",
    provider: draft.provider,
    customerParty: draft.customerParty,
    sections: draft.sections,
    feeTables: draft.feeTables,
    terms: draft.terms,
    signToken: null,
    accessCode: null,
    accessCodeAttempts: 0,
    expiresAt: null,
    contentHash: null,
    sentAt: null,
    firstViewedAt: null,
    signedAt: null,
    signerName: "",
    signerEmail: "",
    signerIp: "",
    signerUserAgent: "",
    declinedAt: null,
    declineReason: "",
    canceledAt: null,
    cancelReason: "",
    linkedSubscriptionId: null,
    linkedInvoiceId: null,
    createdBy: "",
    createdAt: now,
    updatedAt: now,
  };
}

/** 申込・契約URLで使う契約書テンプレート(標準テンプレート → 有効な最初のもの) */
export function pickOrderTemplate<T extends Pick<ContractTemplate, "slug" | "active">>(
  templates: T[],
  defaultSlug: string,
): T | null {
  return (
    templates.find((t) => t.slug === defaultSlug && t.active) ??
    templates.find((t) => t.active) ??
    null
  );
}
