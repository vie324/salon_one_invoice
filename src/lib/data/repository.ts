import type {
  Activity,
  BankTransaction,
  Customer,
  CustomerStatus,
  DashboardMetrics,
  DirectDebitBatch,
  DirectDebitMandate,
  Invoice,
  InvoiceStatus,
  InvoiceType,
  InvoiceWithCustomer,
  Organization,
  PaymentMethod,
  Payment,
  Plan,
  Subscription,
} from "@/lib/domain/types";

export interface InvoiceFilter {
  status?: InvoiceStatus | "all";
  type?: InvoiceType | "all";
  customerId?: string;
  paymentMethod?: PaymentMethod | "all";
  search?: string;
}

export interface CustomerInput {
  code?: string;
  name: string;
  kana?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  postalCode?: string;
  address?: string;
  paymentMethod: PaymentMethod;
  status?: CustomerStatus;
  assignee?: string;
  notes?: string;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface InvoiceInput {
  customerId: string;
  type: InvoiceType;
  issueDate: string;
  dueDate: string;
  paymentMethod: PaymentMethod;
  billingPeriod?: string | null;
  subscriptionId?: string | null;
  items: InvoiceItemInput[];
  notes?: string;
  /** draft で下書き保存、sent で送付済として登録 */
  status?: Extract<InvoiceStatus, "draft" | "sent" | "awaiting_payment">;
}

export interface PaymentInput {
  invoiceId?: string | null;
  customerId: string;
  amount: number;
  method: PaymentMethod | "adjustment";
  paidAt: string;
  reference?: string;
  memo?: string;
  matchedBy?: Payment["matchedBy"];
}

export interface PlanInput {
  name: string;
  description?: string;
  amount: number;
  taxRate: number;
  billingDay: number;
  active?: boolean;
  initialFee?: number;
  term?: import("@/lib/domain/types").PlanTerm;
  options?: import("@/lib/domain/types").PlanOption[];
}

export interface SubscriptionInput {
  customerId: string;
  planId: string;
  startedOn: string;
  billingDay?: number;
  optionKeys?: string[];
}

export interface BankRowInput {
  transactionDate: string;
  amount: number;
  payerName: string;
  description: string;
}

/** Stripe から同期する請求書(外部請求書)の入力 */
export interface StripeInvoiceInput {
  externalId: string;
  stripeCustomerId: string;
  status: "paid" | "failed";
  type: InvoiceType;
  billingPeriod?: string | null;
  issueDate: string;
  lines: { description: string; amount: number }[];
  total: number;
  paidAt?: string | null;
}

export interface StripeSubscriptionInput {
  customerId: string;
  stripeSubscriptionId: string;
  planName: string;
  /** 月額(税込・JPY) */
  amount: number;
  status: import("@/lib/domain/types").SubscriptionStatus;
}

/**
 * データアクセス契約。デモ(インメモリ) / Supabase の双方が実装する。
 * サーバーコンポーネント・サーバーアクションからのみ呼び出す。
 */
export interface Repository {
  // --- 組織 ---
  getOrganization(): Promise<Organization>;

  // --- 顧客 ---
  listCustomers(filter?: { status?: CustomerStatus; search?: string }): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | null>;
  createCustomer(input: CustomerInput): Promise<Customer>;
  updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer>;
  getMandateByCustomer(customerId: string): Promise<DirectDebitMandate | null>;

  // --- プラン / 定期契約 ---
  listPlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | null>;
  createPlan(input: PlanInput): Promise<Plan>;
  updatePlan(id: string, input: Partial<PlanInput>): Promise<Plan>;
  listSubscriptions(): Promise<Subscription[]>;
  createSubscription(input: SubscriptionInput): Promise<Subscription>;
  updateSubscriptionStatus(
    id: string,
    status: Subscription["status"],
  ): Promise<Subscription>;

  // --- 請求書 ---
  listInvoices(filter?: InvoiceFilter): Promise<InvoiceWithCustomer[]>;
  getInvoice(id: string): Promise<InvoiceWithCustomer | null>;
  createInvoice(input: InvoiceInput): Promise<Invoice>;
  updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice>;
  sendInvoice(id: string): Promise<Invoice>;

  // --- 入金 ---
  listPayments(filter?: { customerId?: string }): Promise<Payment[]>;
  recordPayment(input: PaymentInput): Promise<Payment>;

  // --- 引き落としバッチ ---
  listBatches(): Promise<DirectDebitBatch[]>;
  getBatch(id: string): Promise<DirectDebitBatch | null>;
  createBatchFromAwaiting(scheduledDate: string): Promise<DirectDebitBatch>;
  processBatch(id: string, failRate?: number): Promise<DirectDebitBatch>;

  // --- 銀行明細(入金消込) ---
  listBankTransactions(): Promise<BankTransaction[]>;
  importBankTransactions(rows: BankRowInput[]): Promise<BankTransaction[]>;
  matchBankTransaction(txnId: string, invoiceId: string): Promise<void>;

  // --- ダッシュボード / 活動 ---
  getDashboardMetrics(): Promise<DashboardMetrics>;
  listActivities(limit?: number): Promise<Activity[]>;

  // --- 定期請求バッチ生成 ---
  runRecurringBilling(asOf?: string): Promise<{ created: Invoice[] }>;

  // --- Stripe 連携 ---
  linkStripeCustomer(customerId: string, stripeCustomerId: string): Promise<void>;
  findCustomerByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null>;
  upsertStripeSubscription(input: StripeSubscriptionInput): Promise<Subscription>;
  markStripeSubscriptionCanceled(stripeSubscriptionId: string): Promise<void>;
  /** Stripe請求書を同期(externalId で冪等)。作成した Invoice、既存なら null */
  recordStripeInvoice(input: StripeInvoiceInput): Promise<Invoice | null>;
}

// re-export で利用側の import を簡潔に
export type { Organization } from "@/lib/domain/types";
