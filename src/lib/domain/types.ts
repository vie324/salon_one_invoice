/**
 * ドメイン型定義 — 請求管理の中核データモデル。
 * DB(Supabase) / デモ(インメモリ) 双方で共通の形。
 */

export type Role = "owner" | "staff" | "admin";

export type PaymentMethod =
  | "direct_debit" // 口座振替(引き落とし)
  | "bank_transfer" // 銀行振込
  | "credit_card" // クレジットカード
  | "cash"; // 現金/その他

export type CustomerStatus = "active" | "inactive";

export type MandateStatus = "pending" | "active" | "failed" | "revoked";

export type AccountType = "普通" | "当座";

export type BillingCycle = "monthly";

/** 契約期間区分: 月額(単月) / 年間プラン */
export type PlanTerm = "monthly" | "annual";

/** プランに紐づくオプション(例: HPB・ミニモ連携、LINE連携) */
export interface PlanOption {
  key: string;
  name: string;
  /** 月額(税込・JPY) */
  monthly: number;
}

export type SubscriptionStatus = "active" | "paused" | "canceled";

export type InvoiceType = "one_time" | "recurring" | "initial";

export type InvoiceStatus =
  | "draft" // 下書き
  | "sent" // 送付済(入金待ち)
  | "awaiting_payment" // 引き落とし予定 / 入金待ち
  | "partially_paid" // 一部入金
  | "paid" // 入金済
  | "overdue" // 期限超過
  | "failed" // 引落失敗
  | "canceled"; // 取消

export type PaymentStatus = "confirmed" | "pending" | "failed";

export type PaymentMatchSource = "manual" | "csv" | "auto";

export type BatchStatus = "draft" | "submitted" | "processing" | "completed";

export type BatchItemResult = "pending" | "success" | "failed";

export interface Organization {
  id: string;
  name: string;
  postalCode: string;
  address: string;
  tel: string;
  email: string;
  /** インボイス登録番号 (T + 13桁) */
  registrationNumber: string;
  /** 振込先(振込払いの顧客向けに請求書へ記載) */
  bankName: string;
  bankBranch: string;
  bankAccountType: AccountType;
  bankAccountNumber: string;
  bankAccountHolder: string;
  invoicePrefix: string;
  /** 既定税率 (0.10 = 10%) */
  defaultTaxRate: number;
  logoText: string;
}

export interface Customer {
  id: string;
  code: string; // 顧客コード
  name: string; // 顧客/会員名(店舗名や氏名)
  kana: string;
  contactName: string; // 担当者/ご本人
  email: string;
  phone: string;
  postalCode: string;
  address: string;
  paymentMethod: PaymentMethod;
  status: CustomerStatus;
  /** 社内担当者(スタッフ)名 */
  assignee: string;
  notes: string;
  createdAt: string;
  /** Stripe 顧客ID（決済連携時） */
  stripeCustomerId?: string | null;
}

export interface DirectDebitMandate {
  id: string;
  customerId: string;
  bankName: string;
  branchName: string;
  branchCode: string;
  accountType: AccountType;
  /** 口座番号(表示時はマスキング) */
  accountNumber: string;
  accountHolderKana: string;
  status: MandateStatus;
  registeredAt: string | null;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  /** 基本料金(月額)。表示額をそのまま請求(税の扱いは taxRate で調整) */
  amount: number;
  taxRate: number;
  billingCycle: BillingCycle;
  /** 毎月の請求日 (1-28) */
  billingDay: number;
  active: boolean;
  /** 初期費用(単発) */
  initialFee: number;
  /** 契約区分(月額/年間) */
  term: PlanTerm;
  /** 選択可能なオプション */
  options: PlanOption[];
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  startedOn: string;
  /** 次回請求生成日 (YYYY-MM-DD) */
  nextBillingDate: string;
  billingDay: number;
  canceledOn: string | null;
  /** 選択中のオプション(plan.options の key) */
  optionKeys: string[];
  /** Stripe サブスクリプションID（決済連携時） */
  stripeSubscriptionId?: string | null;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number; // 0.10 / 0.08 / 0
  amount: number; // quantity * unitPrice (税抜)
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  subscriptionId: string | null;
  type: InvoiceType;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  /** 定期請求の対象期間 (例: 2026-07) */
  billingPeriod: string | null;
  paymentMethod: PaymentMethod;
  items: InvoiceItem[];
  subtotal: number; // 税抜合計
  taxTotal: number; // 消費税合計
  total: number; // 税込合計
  amountPaid: number; // 入金済額
  notes: string;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  /** 外部システム(Stripe請求書など)のID。冪等化に使用 */
  externalId?: string | null;
}

export interface Payment {
  id: string;
  invoiceId: string | null;
  customerId: string;
  amount: number;
  method: PaymentMethod | "adjustment";
  status: PaymentStatus;
  paidAt: string;
  reference: string; // 摘要/振込人名義など
  matchedBy: PaymentMatchSource;
  memo: string;
  createdAt: string;
}

export interface DirectDebitBatch {
  id: string;
  name: string;
  scheduledDate: string; // 引き落とし予定日
  status: BatchStatus;
  createdAt: string;
  items: DirectDebitBatchItem[];
}

export interface DirectDebitBatchItem {
  id: string;
  batchId: string;
  invoiceId: string;
  customerId: string;
  mandateId: string | null;
  amount: number;
  result: BatchItemResult;
  resultReason: string;
}

export interface BankTransaction {
  id: string;
  transactionDate: string;
  amount: number;
  payerName: string; // 振込人名義
  description: string;
  matchedInvoiceId: string | null;
  matchedPaymentId: string | null;
  importedAt: string;
}

export type ActivityKind =
  | "invoice_created"
  | "invoice_sent"
  | "payment_confirmed"
  | "subscription_created"
  | "batch_processed"
  | "customer_created";

export interface Activity {
  id: string;
  kind: ActivityKind;
  message: string;
  actor: string;
  createdAt: string;
  amount: number | null;
  linkInvoiceId: string | null;
}

/* ---- 集計/ビュー用 ---- */

export interface MonthlyRevenuePoint {
  month: string; // YYYY-MM
  invoiced: number; // 請求額(税込)
  collected: number; // 入金額
}

export interface DashboardMetrics {
  /** 今月の請求額(税込) */
  monthInvoiced: number;
  /** 今月の入金額 */
  monthCollected: number;
  /** 未収金(送付済〜期限超過の未入金残高) */
  outstanding: number;
  /** 期限超過の件数と金額 */
  overdueCount: number;
  overdueAmount: number;
  /** MRR(定期請求の月次経常収益, 税込) */
  mrr: number;
  activeCustomers: number;
  activeSubscriptions: number;
  /** 入金待ち(引き落とし予定含む)の件数 */
  awaitingCount: number;
  awaitingAmount: number;
  /** 前月比(請求額) */
  invoicedMoM: number;
  monthlyTrend: MonthlyRevenuePoint[];
  /** 支払方法別の入金内訳(今月) */
  collectionByMethod: { method: PaymentMethod | "adjustment"; amount: number }[];
}

/* 一覧に顧客名などを添えた表示用の複合型 */
export interface InvoiceWithCustomer extends Invoice {
  customer: Customer;
}
