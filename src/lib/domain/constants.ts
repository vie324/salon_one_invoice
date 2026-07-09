import type {
  BatchItemResult,
  BatchStatus,
  InvoiceStatus,
  InvoiceType,
  MandateStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
  SubscriptionStatus,
} from "./types";

/** バッジの見た目 (globals.css のセマンティックカラーに対応) */
export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

export const roleLabels: Record<Role, string> = {
  owner: "経営者",
  staff: "担当者",
  admin: "管理者",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  direct_debit: "口座振替",
  bank_transfer: "銀行振込",
  credit_card: "クレジットカード",
  cash: "現金・その他",
};

export const paymentMethodShort: Record<PaymentMethod, string> = {
  direct_debit: "振替",
  bank_transfer: "振込",
  credit_card: "カード",
  cash: "現金",
};

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: "下書き",
  sent: "送付済",
  awaiting_payment: "入金待ち",
  partially_paid: "一部入金",
  paid: "入金済",
  overdue: "期限超過",
  failed: "引落失敗",
  canceled: "取消",
};

export const invoiceStatusTone: Record<InvoiceStatus, BadgeTone> = {
  draft: "neutral",
  sent: "info",
  awaiting_payment: "warning",
  partially_paid: "warning",
  paid: "success",
  overdue: "danger",
  failed: "danger",
  canceled: "neutral",
};

export const invoiceTypeLabels: Record<InvoiceType, string> = {
  one_time: "都度",
  recurring: "定期",
  initial: "初期費用",
};

export const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  active: "稼働中",
  paused: "停止中",
  canceled: "解約",
};

export const subscriptionStatusTone: Record<SubscriptionStatus, BadgeTone> = {
  active: "success",
  paused: "warning",
  canceled: "neutral",
};

export const mandateStatusLabels: Record<MandateStatus, string> = {
  pending: "登録申請中",
  active: "有効",
  failed: "登録失敗",
  revoked: "解約",
};

export const mandateStatusTone: Record<MandateStatus, BadgeTone> = {
  pending: "warning",
  active: "success",
  failed: "danger",
  revoked: "neutral",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  confirmed: "確認済",
  pending: "保留",
  failed: "失敗",
};

export const batchStatusLabels: Record<BatchStatus, string> = {
  draft: "作成中",
  submitted: "送信済",
  processing: "処理中",
  completed: "完了",
};

export const batchStatusTone: Record<BatchStatus, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  processing: "warning",
  completed: "success",
};

export const batchItemResultLabels: Record<BatchItemResult, string> = {
  pending: "未処理",
  success: "成功",
  failed: "失敗",
};

export const batchItemResultTone: Record<BatchItemResult, BadgeTone> = {
  pending: "neutral",
  success: "success",
  failed: "danger",
};

/** 未入金として扱うステータス(未収金の集計対象) */
export const OUTSTANDING_STATUSES: InvoiceStatus[] = [
  "sent",
  "awaiting_payment",
  "partially_paid",
  "overdue",
  "failed",
];

/** 消費税率の選択肢 */
export const TAX_RATE_OPTIONS = [
  { value: 0.1, label: "10%" },
  { value: 0.08, label: "8% (軽減)" },
  { value: 0, label: "非課税 0%" },
];
