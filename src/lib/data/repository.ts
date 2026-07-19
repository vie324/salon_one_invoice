import type {
  Activity,
  BankTransaction,
  Contract,
  ContractEvent,
  ContractEventType,
  ContractFeeTable,
  ContractParty,
  ContractSection,
  ContractStatus,
  ContractTemplate,
  ContractTerms,
  ContractWithCustomer,
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

/** 口座振替(マンデート)の登録・更新。NSS等の収納代行への登録状況をツール上で管理する。 */
export interface MandateInput {
  bankName?: string;
  branchName?: string;
  branchCode?: string;
  accountType?: import("@/lib/domain/types").AccountType;
  accountNumber?: string;
  accountHolderKana?: string;
  status: import("@/lib/domain/types").MandateStatus;
  registeredAt?: string | null;
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

/* ---- 契約書 / 電子契約 ---- */

export interface ContractFilter {
  status?: ContractStatus | "all";
  customerId?: string;
  search?: string;
}

export interface ContractTemplateInput {
  slug?: string;
  name: string;
  description?: string;
  docTitle: string;
  preamble?: string;
  sections: ContractSection[];
  feeTables: ContractFeeTable[];
  providerDefault: ContractParty;
  active?: boolean;
}

export interface ContractInput {
  customerId: string;
  templateId?: string | null;
  templateVersion?: number | null;
  title: string;
  preamble?: string;
  provider: ContractParty;
  customerParty: ContractParty;
  sections: ContractSection[];
  feeTables: ContractFeeTable[];
  terms: ContractTerms;
  createdBy?: string;
}

/** 監査証跡イベントの入力(追記専用) */
export interface ContractEventInput {
  type: ContractEventType;
  actor: string;
  ip?: string;
  userAgent?: string;
  detail?: string;
  contentHash?: string;
}

/** 送付(署名依頼)時のパラメータ。トークン・ハッシュは呼び出し側で生成する。 */
export interface ContractSendParams {
  token: string;
  expiresAt: string;
  accessCode: string | null;
  contentHash: string;
  signerEmail: string;
  actor: string;
  ip?: string;
  userAgent?: string;
}

export interface ContractSignParams {
  signerName: string;
  accessCode?: string;
  ip: string;
  userAgent: string;
}

export type ContractActionResult =
  | { ok: true; contract: Contract }
  | { ok: false; error: string; locked?: boolean };

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
  /** 口座振替の登録・更新(顧客ごとに1件)。 */
  upsertMandate(customerId: string, input: MandateInput): Promise<DirectDebitMandate>;

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

  // --- 契約書テンプレート ---
  /** 一覧。既定テンプレートが無ければ自動投入する。 */
  listContractTemplates(): Promise<ContractTemplate[]>;
  getContractTemplate(id: string): Promise<ContractTemplate | null>;
  createContractTemplate(input: ContractTemplateInput): Promise<ContractTemplate>;
  /** 更新のたびに version を加算(既存契約には影響しない=スナップショット方式) */
  updateContractTemplate(
    id: string,
    input: Partial<ContractTemplateInput>,
  ): Promise<ContractTemplate>;

  // --- 契約書 / 電子契約 ---
  listContracts(filter?: ContractFilter): Promise<ContractWithCustomer[]>;
  getContract(id: string): Promise<ContractWithCustomer | null>;
  /** 署名トークンで取得(公開署名ページ用。サービスロールで呼ぶ) */
  getContractByToken(token: string): Promise<ContractWithCustomer | null>;
  createContract(input: ContractInput): Promise<Contract>;
  /** 下書きのみ更新可。送付後の内容変更は拒否される。 */
  updateContractDraft(id: string, input: Partial<ContractInput>): Promise<Contract>;
  /**
   * 送付(署名依頼)。下書き→署名待ちへ。再送(トークン再発行)にも使う。
   * 内容ハッシュを固定化し、以降の内容変更は DB トリガーでも拒否される。
   */
  markContractSent(id: string, params: ContractSendParams): Promise<Contract>;
  /** 契約者が内容を閲覧したことを記録(初回閲覧時刻 + 証跡) */
  recordContractViewed(
    token: string,
    meta: { ip: string; userAgent: string },
  ): Promise<void>;
  /** アクセスコード検証。失敗回数を加算し、上限超過でロック。 */
  verifyContractAccessCode(
    token: string,
    code: string,
    meta: { ip: string; userAgent: string },
  ): Promise<{ ok: boolean; locked?: boolean; error?: string }>;
  /**
   * 電子署名(同意)。ステータス・期限・アクセスコード・内容ハッシュを検証し、
   * 署名者情報(氏名・IP・UA・時刻)を保存して締結済にする。
   */
  signContract(token: string, params: ContractSignParams): Promise<ContractActionResult>;
  /** 契約者による辞退 */
  declineContract(
    token: string,
    params: { reason: string; accessCode?: string; ip: string; userAgent: string },
  ): Promise<ContractActionResult>;
  /** 取消・無効化(スタッフ操作)。証跡は保持される。 */
  cancelContract(id: string, reason: string, actor: string): Promise<Contract>;
  /** 書面で締結した契約の手動登録(紙運用のフォールバック) */
  markContractSignedManually(
    id: string,
    params: { signerName: string; signedAt: string; note: string; actor: string },
  ): Promise<Contract>;
  /**
   * 締結済契約と定期契約/初期費用請求の紐付け。
   * guardUnlinked=true の場合、既に紐付け済みなら何もせず null を返す
   * (並行実行による二重の請求開始を防ぐ)。
   */
  linkContractBilling(
    id: string,
    params: {
      subscriptionId?: string | null;
      invoiceId?: string | null;
      actor: string;
      detail?: string;
      guardUnlinked?: boolean;
    },
  ): Promise<Contract | null>;
  /** 監査証跡の一覧(時系列) */
  listContractEvents(contractId: string): Promise<ContractEvent[]>;
  /** 証跡イベントの追記(リマインド送信の記録など) */
  addContractEvent(contractId: string, event: ContractEventInput): Promise<void>;

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
