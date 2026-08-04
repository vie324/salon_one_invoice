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
  admin: "管理者",
  engineer: "エンジニア",
  billing: "請求管理者",
  dev_manager: "開発・修正管理者",
  owner: "経営者（管理者）",
  staff: "担当者（請求管理者）",
  dev: "開発（エンジニア）",
};

/** 役割ごとのバッジ色 */
export const roleTone: Record<Role, BadgeTone> = {
  admin: "primary",
  engineer: "info",
  billing: "success",
  dev_manager: "warning",
  owner: "primary",
  staff: "success",
  dev: "info",
};

/** アカウント作成・役割変更で選択できる役割(旧種別は新規付与しない) */
export const ASSIGNABLE_ROLES: { value: Role; label: string; description: string }[] = [
  {
    value: "admin",
    label: "管理者",
    description: "全機能 + アカウント管理。要望の実行を承認する「承認者」になります",
  },
  {
    value: "engineer",
    label: "エンジニア",
    description: "開発進捗の対応担当。完了予定日・完了日・対応内容を入力します",
  },
  {
    value: "billing",
    label: "請求管理者",
    description: "請求書・顧客・入金・契約などの請求業務",
  },
  {
    value: "dev_manager",
    label: "開発・修正管理者",
    description: "不具合報告・要望の起票と進捗管理（請求管理者との兼務が可能）",
  },
];

/** 旧種別 → 新しい役割の読み替え */
const LEGACY_ROLE_MAP: Partial<Record<Role, Role>> = {
  owner: "admin",
  staff: "billing",
  dev: "engineer",
};

/**
 * 保有役割を正規化する(旧種別の読み替え + 重複除去)。
 * roles が空のアカウント(移行前)は主ロールを1件持つものとして扱う。
 */
export function normalizeRoles(profile: { role: Role; roles?: Role[] | null }): Role[] {
  const source = profile.roles?.length ? profile.roles : [profile.role];
  const mapped = source.filter(Boolean).map((r) => LEGACY_ROLE_MAP[r] ?? r);
  return [...new Set(mapped)];
}

/** 請求管理(請求書・顧客・入金など)へアクセスできるか */
export function canAccessBilling(roles: Role[]): boolean {
  return roles.some((r) => r === "admin" || r === "billing" || r === "owner" || r === "staff");
}

/** 開発進捗(開発依頼・エラー報告)へアクセスできるか */
export function canAccessDev(roles: Role[]): boolean {
  return roles.some(
    (r) => r === "admin" || r === "engineer" || r === "dev_manager" || r === "owner" || r === "dev",
  );
}

/** 管理者(アカウント管理・要望の実行承認が可能)か */
export function isProductAdmin(roles: Role[]): boolean {
  return roles.some((r) => r === "admin" || r === "owner");
}

/** 要望の実行を承認できる人(= 管理者)。承認者一覧の抽出に使う。 */
export function isApprover(roles: Role[]): boolean {
  return isProductAdmin(roles);
}

/** エンジニア(開発対応の実務担当)か */
export function isEngineer(roles: Role[]): boolean {
  return roles.some((r) => r === "engineer" || r === "dev");
}

/** 開発・修正管理者(依頼の起票・進捗管理)か */
export function isDevManager(roles: Role[]): boolean {
  return roles.includes("dev_manager");
}

/**
 * 兼務している役割の組み合わせを返す(空 = 兼務なし)。
 * 請求管理者と開発・修正管理者は同じ人が担当することがあるため、
 * アカウント管理画面で兼務を明示して権限の付けすぎを確認できるようにする。
 */
export function dualRoleLabels(roles: Role[]): string[] {
  const primary = roles.filter((r) => r === "billing" || r === "dev_manager" || r === "engineer");
  return primary.length >= 2 ? primary.map((r) => roleLabels[r]) : [];
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

/** 承認者数が把握できない場合に用いる既定の必要承諾数 */
export const DEV_EXECUTION_REQUIRED_APPROVALS = 2;

/**
 * 実行有無を判定から導出する。
 * 1名でも停止 → 実行なし / 承認者(管理者)全員が承諾 → 実行 / それ以外 → 未定。
 *
 * @param approverCount 承認者(管理者ロール)の人数。省略時は既定値を使う。
 */
export function computeDevExecution(
  decisions: import("./types").DevApprovalDecision[],
  approverCount?: number,
): import("./types").DevIssueExecution {
  if (decisions.includes("reject")) return "rejected";
  const required = Math.max(1, approverCount ?? DEV_EXECUTION_REQUIRED_APPROVALS);
  if (decisions.filter((d) => d === "approve").length >= required) {
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
  profiles: Pick<import("./types").UserProfile, "id" | "role" | "roles">[];
  requesterId: string;
  actorId: string;
}): string[] {
  const admins = params.profiles
    .filter((p) => isProductAdmin(normalizeRoles(p)))
    .map((p) => p.id);
  const devs = params.profiles.filter((p) => isEngineer(normalizeRoles(p))).map((p) => p.id);
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

/* ---- 申込 ---- */

export const applicationStatusLabels: Record<
  import("./types").ApplicationStatus,
  string
> = {
  submitted: "未対応",
  customer_created: "顧客登録済",
  archived: "対応不要",
};

export const applicationStatusTone: Record<
  import("./types").ApplicationStatus,
  BadgeTone
> = {
  submitted: "warning",
  customer_created: "success",
  archived: "neutral",
};

/** 申込URLの既定有効日数(0 = 無期限) */
export const APPLICATION_LINK_EXPIRY_DAYS = 30;

/** 申込フォームで受け付ける外部サービス連携(表示名つき) */
export const APPLICATION_SERVICES = [
  { key: "hotpepper", label: "ホットペッパービューティ" },
  { key: "minimo", label: "minimo" },
  { key: "epark", label: "EPARK" },
] as const;

export type ApplicationServiceKey = (typeof APPLICATION_SERVICES)[number]["key"];

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
