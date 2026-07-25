import type {
  BatchItemResult,
  BatchStatus,
  ContractEventType,
  ContractStatus,
  DevIssueCategory,
  DevIssueExecution,
  DevIssuePriority,
  DevIssueStatus,
  InvoiceStatus,
  InvoiceType,
  MandateStatus,
  NotificationType,
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
  admin: "全体管理者",
  billing: "請求管理",
  dev: "開発進捗",
  owner: "経営者（全体管理者）",
  staff: "担当者（請求管理）",
};

/** アカウント作成・ロール変更で選択できる種別(旧ロールは新規付与しない) */
export const ASSIGNABLE_ROLES: { value: Role; label: string; description: string }[] = [
  { value: "admin", label: "全体管理者", description: "請求管理・開発進捗の両方 + アカウント管理・実行承認" },
  { value: "billing", label: "請求管理のみ", description: "請求書・顧客・入金などの請求業務" },
  { value: "dev", label: "開発進捗のみ", description: "開発依頼・エラー報告・進捗管理" },
];

/** 請求管理(請求書・顧客・入金など)へアクセスできるか */
export function canAccessBilling(role: Role): boolean {
  return role === "admin" || role === "billing" || role === "owner" || role === "staff";
}

/** 開発進捗(開発依頼・エラー報告)へアクセスできるか */
export function canAccessDev(role: Role): boolean {
  return role === "admin" || role === "dev" || role === "owner";
}

/** プロダクト管理者(実行有無の承認・アカウント管理が可能)か */
export function isProductAdmin(role: Role): boolean {
  return role === "admin" || role === "owner";
}

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

export const contractStatusLabels: Record<ContractStatus, string> = {
  draft: "下書き",
  sent: "署名待ち",
  viewed: "閲覧済",
  signed: "締結済",
  declined: "辞退",
  expired: "期限切れ",
  canceled: "取消",
};

export const contractStatusTone: Record<ContractStatus, BadgeTone> = {
  draft: "neutral",
  sent: "info",
  viewed: "warning",
  signed: "success",
  declined: "danger",
  expired: "danger",
  canceled: "neutral",
};

export const contractEventLabels: Record<ContractEventType, string> = {
  created: "契約書を作成",
  updated: "下書きを更新",
  sent: "署名依頼を送付",
  reminded: "リマインドを送信",
  viewed: "契約者が閲覧",
  code_failed: "アクセスコード誤入力",
  code_verified: "アクセスコードを確認",
  signed: "電子署名(同意)",
  manual_signed: "書面締結を登録",
  declined: "締結を辞退",
  canceled: "契約書を取消",
  billing_linked: "請求連携を開始",
};

/* ---- 開発依頼 / 進捗管理 ---- */

export const devIssueCategoryLabels: Record<DevIssueCategory, string> = {
  bug: "不具合",
  request: "要望",
};

export const devIssueCategoryTone: Record<DevIssueCategory, BadgeTone> = {
  bug: "danger",
  request: "warning",
};

export const devIssuePriorityLabels: Record<DevIssuePriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export const devIssuePriorityTone: Record<DevIssuePriority, BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

export const devIssueStatusLabels: Record<DevIssueStatus, string> = {
  open: "未対応",
  in_progress: "対応中",
  hearing: "追加ヒアリング",
  done: "対応完了",
};

export const devIssueStatusTone: Record<DevIssueStatus, BadgeTone> = {
  open: "neutral",
  in_progress: "warning",
  hearing: "info",
  done: "success",
};

export const devIssueExecutionLabels: Record<DevIssueExecution, string> = {
  undecided: "未定",
  approved: "実行",
  rejected: "実行なし",
};

export const devIssueExecutionTone: Record<DevIssueExecution, BadgeTone> = {
  undecided: "neutral",
  approved: "primary",
  rejected: "danger",
};

/** 実行に必要なプロダクト管理者の承諾数 */
export const DEV_EXECUTION_REQUIRED_APPROVALS = 2;

/**
 * 実行有無を判定から導出する。
 * 1名でも停止 → 実行なし / 承諾が規定数(2名) → 実行 / それ以外 → 未定。
 */
export function computeDevExecution(
  decisions: import("./types").DevApprovalDecision[],
): import("./types").DevIssueExecution {
  if (decisions.includes("reject")) return "rejected";
  if (decisions.filter((d) => d === "approve").length >= DEV_EXECUTION_REQUIRED_APPROVALS) {
    return "approved";
  }
  return "undecided";
}

/**
 * 開発依頼イベントの通知先を決める(操作者本人は除外)。
 * - 新規依頼:     プロダクト管理者 + エンジニア
 * - 対応完了:     依頼者 + プロダクト管理者(トップに通知が出る)
 * - 追加ヒアリング: 依頼者
 * - 実行判定確定:  依頼者 + エンジニア
 */
export function devNotificationRecipients(params: {
  type: NotificationType;
  profiles: Pick<import("./types").UserProfile, "id" | "role">[];
  requesterId: string;
  actorId: string;
}): string[] {
  const admins = params.profiles.filter((p) => isProductAdmin(p.role)).map((p) => p.id);
  const devs = params.profiles.filter((p) => p.role === "dev").map((p) => p.id);
  let ids: string[] = [];
  switch (params.type) {
    case "issue_created":
      ids = [...admins, ...devs];
      break;
    case "issue_done":
      ids = [params.requesterId, ...admins];
      break;
    case "issue_hearing":
      ids = [params.requesterId];
      break;
    case "issue_execution":
      ids = [params.requesterId, ...devs];
      break;
  }
  return [...new Set(ids)].filter((id) => id && id !== params.actorId);
}

export const notificationTypeLabels: Record<NotificationType, string> = {
  issue_created: "新規依頼",
  issue_done: "対応完了",
  issue_hearing: "追加ヒアリング",
  issue_execution: "実行判定",
};

export const notificationTypeTone: Record<NotificationType, BadgeTone> = {
  issue_created: "info",
  issue_done: "success",
  issue_hearing: "warning",
  issue_execution: "primary",
};

/** 署名依頼の既定有効日数 */
export const CONTRACT_SIGN_EXPIRY_DAYS = 14;

/** アクセスコードの許容失敗回数(超過でロック) */
export const CONTRACT_CODE_MAX_ATTEMPTS = 10;

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
