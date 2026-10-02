/**
 * ドメイン型定義 — 請求管理の中核データモデル。
 * DB(Supabase) / デモ(インメモリ) 双方で共通の形。
 */

/**
 * アカウントの役割。1アカウントに複数割り当てできる(兼務)。
 * - admin       管理者。全機能 + アカウント管理 + 要望の実行承認(承認者)
 * - engineer    エンジニア。開発対応(完了日・対応内容)の実務担当
 * - billing     請求管理者。請求書・顧客・入金などの請求業務
 * - dev_manager 開発・修正管理者。開発依頼・不具合報告の起票と進捗管理
 *
 * owner / staff / dev は旧アカウント種別(移行用)。新規付与はしない。
 */
export type Role =
  | "admin"
  | "engineer"
  | "billing"
  | "dev_manager"
  // --- 旧種別(移行用) ---
  | "owner"
  | "staff"
  | "dev";

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
  /** 支店番号(3桁)。振込先の案内に併記する */
  bankBranchCode: string;
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
  /** メモ(特別待遇の理由・注記事項など) */
  notes: string;
  createdAt: string;
  /** Stripe 顧客ID（決済連携時） */
  stripeCustomerId?: string | null;
  /** 獲得した営業代理店/営業マン(代理店報酬の計算に使用) */
  agencyId?: string | null;
  agencyMemberId?: string | null;
  /**
   * この顧客を獲得したときの代理店区分(取次型 / 営業・初期設定型)。
   * 報酬率と、初期設定を誰が行うかが決まる。null = 代理店の既定区分。
   */
  agencyDealType?: AgencyDealType | null;
  /**
   * 紹介してくれた顧客。紹介制度から登録された顧客に設定する。
   * 初回請求の特典(初月日割り無料＋2ヶ月無料)と、紹介者へのお支払いの判定に使う。
   */
  referredByCustomerId?: string | null;
  /** 削除(ゴミ箱)に入れた日時。null/未設定 = 有効なデータ。 */
  deletedAt?: string | null;
}

/**
 * 口座振替(NSS 日本システム収納)の手続き状況。顧客ごとに1件。
 *
 * 口座番号などの口座情報は NSS 側で管理するため、このツールでは新たに保持しない
 * (bankName〜accountHolderKana は旧運用で入力されたデータの表示・消去用に残している)。
 * ここで管理するのは「依頼書の郵送 → 回収 → NSSへ登録 → 振替開始」の進み具合だけ。
 */
export interface DirectDebitMandate {
  id: string;
  customerId: string;
  /** @deprecated 旧運用の口座情報。NSS運用では入力しない */
  bankName: string;
  /** @deprecated */
  branchName: string;
  /** @deprecated */
  branchCode: string;
  /** @deprecated */
  accountType: AccountType;
  /** @deprecated 口座番号(表示時はマスキング) */
  accountNumber: string;
  /** @deprecated */
  accountHolderKana: string;
  status: MandateStatus;
  /** NSS の登録が完了した日 */
  registeredAt: string | null;
  /** 口座振替依頼書をお客様へ郵送した日 */
  formSentOn: string | null;
  /** 記入済みの依頼書をお客様から回収した日 */
  formReceivedOn: string | null;
  /** 依頼書を NSS へ送付し、収納サイトで登録した日 */
  nssSubmittedOn: string | null;
  /** 引き落としが始まる月 (YYYY-MM)。NSS の登録完了時に確認する */
  debitStartMonth: string | null;
  /** NSS 側の顧客番号など(照合用・任意) */
  nssCustomerNumber: string;
  /** メモ(不備の内容・再提出の経緯など) */
  note: string;
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
  /**
   * 基本料金の個別価格(税抜・1店舗あたり)。特別待遇・紹介割引などプラン定価と異なる場合に設定。
   * null/undefined ならプランの定価(plan.amount)を請求する。
   */
  priceOverride?: number | null;
  /**
   * 契約店舗数。月額(基本料金＋オプション)は1店舗あたりの金額なので、
   * 毎月の請求はこの店舗数を掛けて計算する。未設定は1店舗。
   */
  storeCount?: number;
  /** Stripe サブスクリプションID（決済連携時） */
  stripeSubscriptionId?: string | null;
  /** 削除(ゴミ箱)に入れた日時。null/未設定 = 有効なデータ。 */
  deletedAt?: string | null;
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
  /** 督促メールの送付回数(未送付は 0/未設定) */
  reminderCount?: number;
  /** 最後に督促メールを送付した日時 */
  lastReminderAt?: string | null;
  /** 削除(ゴミ箱)に入れた日時。null/未設定 = 有効なデータ。 */
  deletedAt?: string | null;
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
  /** 削除(ゴミ箱)に入れた日時。null/未設定 = 有効なデータ。 */
  deletedAt?: string | null;
}

export interface DirectDebitBatch {
  id: string;
  name: string;
  scheduledDate: string; // 引き落とし予定日
  status: BatchStatus;
  createdAt: string;
  items: DirectDebitBatchItem[];
  /** 削除(ゴミ箱)に入れた日時。null/未設定 = 有効なデータ。 */
  deletedAt?: string | null;
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
  /** 削除(ゴミ箱)に入れた日時。null/未設定 = 有効なデータ。 */
  deletedAt?: string | null;
}

/* ---- 営業代理店 ---- */

/**
 * 代理店の区分(どこまで代理店が担当するか)。報酬率が決まる。
 * - referral     取次型:          お客様のご紹介(取次)まで。商談〜初期設定は当社。初期費用の50%
 * - sales_setup  営業・初期設定型: 営業(商談〜申込)と初期設定まで代理店が担当。初期費用の100%
 *
 * 伴走型(導入後の運用支援まで担当)は今後追加予定。constants.ts の AGENCY_DEAL_TYPES に
 * 1件足せば、画面・計算の選択肢に出るようにしてある。
 */
export type AgencyDealType = "referral" | "sales_setup";

/** 営業代理店。獲得したお客様の初期費用に区分ごとの率を掛けて報酬を支払う。 */
export interface Agency {
  id: string;
  code: string; // 代理店コード
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  /** 既定の区分。代理店URLから申し込んだお客様にはこの区分が付く(案件ごとに変更可) */
  defaultDealType: AgencyDealType;
  /**
   * @deprecated 旧方式(毎月の入金済売上 × 率)の手数料率。現在の報酬計算には使わない
   * (伴走型を作るときに月額連動の報酬として使う可能性があるため列は残している)。
   */
  commissionRate: number;
  notes: string;
  active: boolean;
  createdAt: string;
}

/**
 * 代理店報酬(1件 = 獲得したお客様1件ぶん)。受注確定(初回請求の作成)時に金額を確定して記録する。
 * 支払対象になるのは、お客様の初期費用の入金を確認してから。
 */
export interface AgencyCommission {
  id: string;
  agencyId: string;
  agencyMemberId: string | null;
  customerId: string;
  /** 報酬の対象になった初回請求書(初期費用) */
  invoiceId: string | null;
  dealType: AgencyDealType;
  /** 対象の初期費用(税抜) */
  baseAmount: number;
  /** 率 (0.5 = 50%) */
  rate: number;
  /** 報酬額 = 初期費用(税抜) × 率(円未満四捨五入) */
  amount: number;
  /** 代理店へ支払った日 (null = 未払い) */
  paidAt: string | null;
  note: string;
  createdAt: string;
}

/**
 * 代理報酬の状況(保存値ではなく、初回請求の入金状況から導出する)。
 * pending(初期費用の入金待ち) → payable(支払対象) → paid(支払済) / void(初回請求の取消)
 */
export type AgencyCommissionStatus = "pending" | "payable" | "paid" | "void";

/** 代理店に所属する営業マン。顧客獲得の実績を個人単位で集計する。 */
export interface AgencyMember {
  id: string;
  agencyId: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
}

/* ---- 契約書 / 電子契約 ---- */

/**
 * 契約書ステータス。
 * draft(下書き・編集可) → sent(送付済/署名待ち) → viewed(閲覧済) → signed(締結済)。
 * declined(辞退) / canceled(取消・無効化) は終端。expired は表示用の実効ステータス
 * (保存値は sent/viewed のまま、署名期限切れを導出)。
 */
export type ContractStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "expired"
  | "canceled";

/** 契約書の条文(章)。body は改行区切りのプレーンテキスト。 */
export interface ContractSection {
  title: string; // 例: 第1条（目的・定義）
  body: string;
}

/** 料金表の1行。金額は「30,000円、または…」等の表記を許すため文字列。 */
export interface ContractFeeRow {
  item: string;
  amount: string;
  note?: string;
}

/** 料金表(別表)。本文中の {{料金表}} プレースホルダ位置に描画される。 */
export interface ContractFeeTable {
  title: string; // 例: ■ 通常料金【システム関連費用】
  rows: ContractFeeRow[];
}

/** 契約当事者(甲/乙)のスナップショット。締結時点の記載を固定化する。 */
export interface ContractParty {
  name: string; // 会社名/屋号
  postalCode: string;
  address: string;
  representative: string; // 代表者/署名者
  email: string;
}

/**
 * 申込内容(構造化)。検索(電帳法の取引金額・取引先・年月日)と
 * 締結後の請求連携(定期契約・初期費用請求の自動作成)に使う。
 */
export interface ContractTerms {
  planId: string | null;
  planName: string; // スナップショット(プラン削除後も表示可能に)
  optionKeys: string[];
  storeCount: number;
  /** 初期費用(税抜)。null = 契約書上の記載に従う */
  initialFee: number | null;
  /** 月額合計(税抜・オプション込み・全店舗分) */
  monthlyFee: number | null;
  /**
   * 月額基本料金の個別価格(税抜・1店舗あたり)。null/未設定 = プラン定価。
   * 受注確定で作る定期契約の priceOverride にそのまま引き継ぐ。
   */
  priceOverride?: number | null;
  /** 契約開始日(予定) */
  startDate: string | null;
  notes: string;
}

/** 契約書テンプレート。契約作成時に内容をコピー(スナップショット)する。 */
export interface ContractTemplate {
  id: string;
  /** 識別スラッグ(既定テンプレートの重複作成防止に使用) */
  slug: string;
  name: string;
  description: string;
  /** 書面タイトル(例: SalonOne サービス利用契約書) */
  docTitle: string;
  /** 前文 */
  preamble: string;
  sections: ContractSection[];
  feeTables: ContractFeeTable[];
  /** 甲(サービス提供者)の既定値 */
  providerDefault: ContractParty;
  version: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 契約書(申込書)。送付後は内容(条文・料金・当事者)が凍結される。 */
/**
 * 署名依頼の渡し方。
 * - email: 契約者へメールで署名リンクを送付する
 * - link: メールを送らずに署名リンクを発行し、担当者が別経路(LINE・SMS・対面・QR)で渡す
 * - form: 申込・契約URLのフォーム上で、お客様ご自身が入力した内容の契約書を提示する
 */
export type ContractDeliveryMethod = "email" | "link" | "form";

export interface Contract {
  id: string;
  contractNumber: string; // CTR-YYYYMM-####
  customerId: string;
  templateId: string | null;
  templateVersion: number | null;
  title: string;
  preamble: string;
  status: ContractStatus;
  provider: ContractParty; // 甲
  customerParty: ContractParty; // 乙
  sections: ContractSection[];
  feeTables: ContractFeeTable[];
  terms: ContractTerms;
  /** 署名用トークン(URLに使用)。crypto乱数48hex。 */
  signToken: string | null;
  /** アクセスコード(6桁)。別経路(電話等)で伝達し2要素とする。null=不要 */
  accessCode: string | null;
  accessCodeAttempts: number;
  /** 署名期限 */
  expiresAt: string | null;
  /** 送付時に固定化した契約内容の SHA-256 ハッシュ(改ざん検知) */
  contentHash: string | null;
  sentAt: string | null;
  firstViewedAt: string | null;
  signedAt: string | null;
  signerName: string;
  signerEmail: string;
  signerIp: string;
  signerUserAgent: string;
  declinedAt: string | null;
  declineReason: string;
  canceledAt: string | null;
  cancelReason: string;
  /** 締結後に開始した定期契約/初期費用請求への紐付け */
  linkedSubscriptionId: string | null;
  linkedInvoiceId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 監査証跡イベント種別 */
export type ContractEventType =
  | "created" // 作成
  | "updated" // 下書き更新
  | "sent" // 送付(署名依頼)
  | "reminded" // リマインド送信
  | "viewed" // 契約者が閲覧
  | "code_failed" // アクセスコード誤り
  | "code_verified" // アクセスコード確認
  | "signed" // 電子署名(同意)
  | "manual_signed" // 書面締結の手動登録
  | "declined" // 辞退
  | "canceled" // 取消・無効化
  | "billing_linked"; // 請求連携(定期契約/初期費用の作成)

/**
 * 契約書の監査証跡。追記専用(UPDATE/DELETE はDBトリガーで禁止)。
 * 締結の真正性を裏付ける証拠として IP・UA・時刻・内容ハッシュを保全する。
 */
export interface ContractEvent {
  id: string;
  contractId: string;
  type: ContractEventType;
  actor: string; // スタッフ名 / 署名者名 / "システム"
  ip: string;
  userAgent: string;
  detail: string;
  contentHash: string;
  createdAt: string;
}

export interface ContractWithCustomer extends Contract {
  customer: Customer;
}

export type ActivityKind =
  | "invoice_created"
  | "invoice_sent"
  | "payment_confirmed"
  | "subscription_created"
  | "batch_processed"
  | "customer_created"
  | "contract_created"
  | "contract_sent"
  | "contract_signed"
  | "application_submitted"
  | "referral_submitted"
  | "reminder_sent"
  | "commission_paid"
  | "debit_registered";

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
  /** 集計対象の月 (YYYY-MM)。ダッシュボードの月タブで切り替える。 */
  month: string;
  /** 対象月の請求額(税込) */
  monthInvoiced: number;
  /** 対象月の入金額 */
  monthCollected: number;
  /** 対象月に発行した請求のうち、現時点で未入金の残高 */
  monthOutstanding: number;
  /** 未収金(送付済〜期限超過の未入金残高)。対象月に関係なく現時点の全体。 */
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
  /** 前月比(請求額。対象月とその前月の比較) */
  invoicedMoM: number;
  /** 対象月を末尾とする直近6ヶ月の推移 */
  monthlyTrend: MonthlyRevenuePoint[];
  /** 支払方法別の入金内訳(対象月) */
  collectionByMethod: { method: PaymentMethod | "adjustment"; amount: number }[];
}

/* 一覧に顧客名などを添えた表示用の複合型 */
export interface InvoiceWithCustomer extends Invoice {
  customer: Customer;
}

/* ---- 開発依頼 / 進捗管理 (Salon One 開発対応表) ---- */

/** 分類: 不具合 / 要望 */
export type DevIssueCategory = "bug" | "request";

/** 優先度: 高 / 中 / 低 */
export type DevIssuePriority = "high" | "medium" | "low";

/**
 * ステータス。
 * open(未対応) → in_progress(対応中) → done(対応完了)。
 * hearing(追加ヒアリング) はエンジニアが依頼者へ追加確認したい場合。
 */
export type DevIssueStatus = "open" | "in_progress" | "hearing" | "done";

/**
 * 実行有無(要望の実行判定)。
 * プロダクト管理者(全体管理者)2名が承諾 → approved(実行)。
 * どちらか1名でも停止 → rejected(実行なし)。それまでは undecided(未定)。
 */
export type DevIssueExecution = "undecided" | "approved" | "rejected";

/** プロダクト管理者の個別判定 */
export type DevApprovalDecision = "approve" | "reject";

export interface DevIssueApproval {
  id: string;
  issueId: string;
  approverId: string;
  approverName: string;
  decision: DevApprovalDecision;
  createdAt: string;
}

/**
 * 追加ヒアリングの返信がどちら側からのものか。
 * requester(依頼者側の回答) / engineer(エンジニア側の確認・追いヒアリング)。
 */
export type DevIssueReplyRole = "requester" | "engineer";

/**
 * 追加ヒアリングのやり取り(追記のみのスレッド)。
 * エンジニアの確認事項に対して依頼者が返信し、相手側へ通知が飛ぶ。
 */
export interface DevIssueReply {
  id: string;
  issueId: string;
  /** 投稿者(profiles.id / デモユーザーID) */
  authorId: string;
  authorName: string;
  /** 依頼者側の回答か、エンジニア側の確認か */
  authorRole: DevIssueReplyRole;
  body: string;
  /** この返信を通知した相手の氏名(共有できたことを画面で示すために保持) */
  notifiedNames: string[];
  createdAt: string;
}

/**
 * 開発依頼(不具合報告・機能要望)。スプレッドシートの1行に相当する。
 *
 * 完了希望日(desired_date)・対応完了予定日(scheduled_date)は、日付を突き合わせる
 * 運用が負担だったため廃止した。DBのカラムは復活させる可能性を見て残してあるが、
 * アプリからは読み書きしないので、ここにも持たせない。
 */
export interface DevIssue {
  id: string;
  /** 表示用の連番 (#12) */
  issueNumber: number;
  /** 課題名 */
  title: string;
  /** 詳細(修正や不具合の中身) */
  detail: string;
  category: DevIssueCategory;
  priority: DevIssuePriority;
  status: DevIssueStatus;
  /** 実行有無(承認状況から導出、または全体管理者の直接設定) */
  execution: DevIssueExecution;
  /**
   * 実行有無を直接設定した全体管理者の氏名。null = 承諾状況からの自動判定。
   * 設定されている間は承諾の増減で実行有無が上書きされない。
   */
  executionSetByName: string | null;
  executionSetAt: string | null;
  /** 依頼者(入力したアカウント) */
  requesterId: string;
  requesterName: string;
  /** 対応完了日(エンジニアが入力) */
  completedDate: string | null;
  /** 開発対応内容(エンジニアの追記) */
  devNote: string;
  /** プロダクト管理者の実行判定(要望のみ使用) */
  approvals: DevIssueApproval[];
  /** 追加ヒアリングのやり取り(古い順) */
  replies: DevIssueReply[];
  /** 手動の並び順(小さいほど上)。ドラッグで入れ替えたときに更新する。 */
  sortOrder: number;
  /** 記載日 */
  createdAt: string;
  updatedAt: string;
}

/**
 * 開発依頼の添付画像(スクリーンショット・注釈入り画像・AIモック)。
 * デモは data URL、本番は Supabase Storage(表示は署名付きURL)。
 */
export interface DevIssueAttachment {
  id: string;
  issueId: string;
  fileName: string;
  contentType: string;
  /** 表示用URL(デモ: data URL / 本番: 署名付きURL・約1時間有効) */
  url: string;
  /** 添付の種類: screenshot(スクショ等) / mock(AI生成モック) */
  kind: "screenshot" | "mock";
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
}

/* ---- 開発スケジュール (中長期ロードマップ) ---- */

/**
 * スケジュール項目の進み具合。
 * planned(予定) → in_progress(今週対応中) → done(完了)。
 * dropped(見送り) はスプレッドシートの取り消し線に相当し、表では控えめに残す。
 */
export type DevScheduleStatus = "planned" | "in_progress" | "done" | "dropped";

/**
 * スケジュール項目に連動している開発進捗(依頼)の要約。
 * 一覧では折りたたんで件数だけ出し、開いたときにこの内容を見せる。
 */
export interface DevScheduleLinkedIssue {
  issueId: string;
  /** 表示用の連番 (#143)。開発MTGではこの番号で会話している。 */
  issueNumber: number;
  title: string;
  category: DevIssueCategory;
  priority: DevIssuePriority;
  status: DevIssueStatus;
  execution: DevIssueExecution;
  completedDate: string | null;
}

/**
 * スケジュール表の1行 = 「機能」1件。
 * スプレッドシートの「カテゴリ / 機能 / 優先度 / 9月・10月…」に対応する。
 *
 * 依頼(DevIssue)は機能の下にぶら下げる。1機能に複数の依頼を束ねられるので、
 * 開発MTGでは「依頼◯件」ではなく「機能◯件」で共有できる。
 */
export interface DevScheduleItem {
  id: string;
  /** カテゴリ(基盤 / 分析 / 人事 / CRM / 外部連携 …)。自由入力。 */
  category: string;
  /** 機能名 */
  title: string;
  /** 優先度(★の数 1〜5) */
  priority: number;
  status: DevScheduleStatus;
  /** 表の列(YYYY-MM)。未定なら null。 */
  targetMonth: string | null;
  /** 着手・完了の目安日(YYYY-MM-DD)。「★9/7」の 9/7 にあたる。 */
  targetDate: string | null;
  /** 日程が確定しているか(★=確定 / ☆=未確定) */
  confirmed: boolean;
  /** 補足メモ(「酒井モック」など) */
  note: string;
  /** 表示順(小さいほど上) */
  sortOrder: number;
  /** 連動している開発進捗(依頼番号の小さい順) */
  links: DevScheduleLinkedIssue[];
  createdAt: string;
  updatedAt: string;
}

/* ---- アプリ内通知 ---- */

export type NotificationType =
  | "issue_created" // 新しい開発依頼
  | "issue_done" // 対応完了
  | "issue_hearing" // 追加ヒアリング(依頼者への確認)
  | "issue_hearing_reply" // 追加ヒアリングへの返信(相手側への共有)
  | "issue_execution"; // 実行有無の判定確定

export interface AppNotification {
  id: string;
  /** 受信者(profiles.id / デモユーザーID) */
  userId: string;
  type: NotificationType;
  message: string;
  issueId: string | null;
  read: boolean;
  createdAt: string;
}

/* ---- 申込(お客様に渡す申込・契約URLからの入力) ---- */

/**
 * 申込・契約URL。トークン付きのURLを発行してお客様(または代理店)に渡す。
 *
 * withContract=true(標準)は「申込＋契約」を1本のURLで完結させる:
 *   お客様情報の入力 → プラン・料金の確認 → 契約内容の確認と電子署名 まで進み、
 *   送信と同時に顧客・契約(締結済)・受注管理の案件が作られる。
 * withContract=false は「申込のみ」(旧来の動き)。契約書は担当者が後から送る。
 *
 * 無効化・有効期限で受付を止められる。
 */
export interface ApplicationLink {
  id: string;
  /** URL に使うトークン(crypto乱数) */
  token: string;
  /** 宛先メモ(例: ○○サロン様)。管理画面での識別用 */
  name: string;
  active: boolean;
  /** 受付期限(null = 無期限) */
  expiresAt: string | null;
  /** これまでの申込件数 */
  submissionCount: number;
  /** true = 申込＋契約(電子署名まで) / false = 申込のみ(契約書は後から送付) */
  withContract: boolean;
  /** 申込むプラン(withContract では必須) */
  planId: string | null;
  /** オプションの初期選択(お客様がフォームで変更できる) */
  optionKeys: string[];
  /** 契約店舗数。null = お客様がフォームで入力する */
  storeCount: number | null;
  /** 初期費用の個別価格(税抜)。null = プラン通り */
  initialFeeOverride: number | null;
  /** 月額基本料金の個別価格(税抜・1店舗あたり)。null = プラン通り */
  monthlyPriceOverride: number | null;
  /** 代理店URL・代理店経由の案件なら、獲得代理店/営業マン */
  agencyId: string | null;
  agencyMemberId: string | null;
  /** 代理店区分(null = 代理店の既定区分) */
  agencyDealType: AgencyDealType | null;
  /** 紹介・問い合わせから発行したURLなら、その紹介 */
  referralId: string | null;
  /** 「まずは相談したい」(問い合わせ)の入口を出すか。代理店URL向け */
  allowInquiry: boolean;
  createdBy: string;
  createdAt: string;
}

/** 外部サービスの連携情報(ID・パスワード)。保存時は暗号化する。 */
export interface ServiceCredential {
  loginId: string;
  password: string;
}

/**
 * 申込のステータス。
 * submitted(受付) → customer_created(顧客登録済) / archived(対応不要)
 */
export type ApplicationStatus = "submitted" | "customer_created" | "archived";

/** 申込フォームの入力内容 */
export interface Application {
  id: string;
  linkId: string | null;
  /** 申込時のリンク名(リンク削除後も分かるように保持) */
  linkName: string;
  /** 法人名(個人の場合は個人名) */
  companyName: string;
  /** 住所(法人の場合は登記住所) */
  address: string;
  /** 代表者役職 */
  representativeTitle: string;
  /** 代表者名 */
  representativeName: string;
  /** ご担当者名(任意。未入力なら代表者名を引き継ぐ) */
  contactName: string;
  /** 電話番号 */
  phone: string;
  /** メールアドレス(請求書・連絡の送付先) */
  email: string;
  /** ホットペッパービューティ連携情報(任意) */
  hotpepper: ServiceCredential | null;
  /** minimo 連携情報(任意) */
  minimo: ServiceCredential | null;
  /** EPARK 連携情報(任意) */
  epark: ServiceCredential | null;
  /** LINE連携の申込有無 */
  lineRequested: boolean;
  status: ApplicationStatus;
  /** 顧客として取り込んだ場合の紐付け */
  customerId: string | null;
  /** 申込＋契約URLから届いた場合、同時に締結した契約書 */
  contractId: string | null;
  /** 代理店経由の申込なら、獲得代理店/営業マン(URLから引き継ぐ) */
  agencyId: string | null;
  agencyMemberId: string | null;
  /** 紹介・問い合わせから発行したURL経由なら、その紹介 */
  referralId: string | null;
  submittedAt: string;
  submittedIp: string;
}

/* ---- 紹介制度 ---- */

/**
 * 連絡してほしい方法。
 * 紹介された方が「どう連絡してほしいか」を選ぶ。
 */
export type ReferralContactMethod = "phone" | "email" | "sms" | "line";

/**
 * 連絡希望の時間帯。
 * 日付とあわせて「いつ連絡してほしいか」を受け取る。
 */
export type ReferralTimeSlot =
  | "anytime"
  | "morning"
  | "early_afternoon"
  | "late_afternoon"
  | "evening";

/**
 * 紹介の対応状況。
 * submitted(受付) → contacted(連絡済) → customer_created(顧客登録済) / archived(対応不要)
 */
export type ReferralStatus = "submitted" | "contacted" | "customer_created" | "archived";

/**
 * 紹介報酬(紹介した側へのお支払い)の状況。
 * pending(初期費用が未確定) → payable(支払額が確定) → paid(支払済)
 */
export type ReferralRewardStatus = "pending" | "payable" | "paid";

/**
 * 紹介フォームのURL。
 * 常設フォーム(/refer)とは別に、紹介者を指定したURLを発行できる。
 * 指定すると、フォームの「誰に紹介されたか」が埋まった状態で開く。
 */
export interface ReferralLink {
  id: string;
  /** URL に使うトークン(crypto乱数) */
  token: string;
  /** 宛先メモ(例: ○○サロン様用)。管理画面での識別用 */
  name: string;
  /** 紹介者(顧客)。null = 紹介者をフォームで入力してもらう */
  referrerCustomerId: string | null;
  /** 紹介者名(顧客を削除しても残す) */
  referrerName: string;
  active: boolean;
  /** 受付期限(null = 無期限) */
  expiresAt: string | null;
  /** これまでの紹介件数 */
  submissionCount: number;
  createdBy: string;
  createdAt: string;
}

/** 紹介フォームの入力内容(1件の紹介) */
export interface Referral {
  id: string;
  /** 発行したURLから届いた場合の紐付け(常設フォームからは null) */
  linkId: string | null;
  /** 誰に紹介されたか(フォームの入力そのまま) */
  referrerName: string;
  /** 突き合わせた紹介者(顧客)。管理画面で紐付ける */
  referrerCustomerId: string | null;
  /** 店舗名・法人名 */
  companyName: string;
  /** お名前・ご担当者名 */
  contactName: string;
  phone: string;
  email: string;
  /** 連絡してほしい方法 */
  contactMethod: ReferralContactMethod;
  /** 連絡希望日 (YYYY-MM-DD)。null = 希望なし */
  preferredDate: string | null;
  /** 連絡希望の時間帯 */
  preferredTimeSlot: ReferralTimeSlot;
  /** ご相談内容・メモ */
  note: string;
  status: ReferralStatus;
  /** 顧客として登録した場合の紐付け(紹介された側) */
  customerId: string | null;
  /** 紹介報酬の対象となる初期費用(税抜) */
  rewardBaseAmount: number;
  /** 紹介報酬 = 初期費用 × 25%(円未満四捨五入) */
  rewardAmount: number;
  rewardStatus: ReferralRewardStatus;
  rewardPaidAt: string | null;
  /**
   * 代理店経由の問い合わせなら、その代理店/営業マン。
   * 代理店URLの「まずは相談したい」から届いたもの。紹介報酬(25%)ではなく代理店報酬の対象になる。
   */
  agencyId: string | null;
  agencyMemberId: string | null;
  /** 代理店URL(申込・契約URL)から届いた問い合わせなら、そのURL */
  applicationLinkId: string | null;
  submittedAt: string;
  submittedIp: string;
  updatedAt: string;
}

/* ---- 受注管理 (申込・契約 → 受注確認 → 導入準備 → 運用中) ---- */

/**
 * 案件(顧客1件)の進み具合。受注管理の列に対応する。
 * ステージは契約・請求・入金・NSS・チェックリストの実データから自動で決まる
 * (手で動かすのは「休止・解約・見送り」だけ)。
 *
 * - application 申込・契約: お客様の申込・電子署名を待っている
 * - review      受注確認:   締結済み。請求管理者が内容を確認して「受注確定」する
 * - setup       導入準備:   初回請求・入金 / 口座振替(NSS) / 初期設定 を並行で進める
 * - operating   運用中:     導入準備がすべて完了。毎月の請求・引き落としの運用
 * - closed      休止・解約・見送り
 *
 * 旧ステージ(contract / initial_billing / debit_setup / initial_payment)は
 * 移行 0023 で新ステージへ読み替える。
 */
export type OnboardingStage = "application" | "review" | "setup" | "operating" | "closed";

/** 案件のチェックリスト1項目(手で付けるもの。実データから自動で判定する項目は保存しない) */
export interface OnboardingChecklistItem {
  key: string;
  label: string;
  done: boolean;
  doneAt: string | null;
  doneBy: string;
  /**
   * 受注管理(移行後の画面)で最後に付け外しした日時。
   * 旧「顧客ステータス」のままの項目には無い(旧画面の記録から引き継ぐかの判定に使う)。
   */
  updatedAt?: string | null;
}

/**
 * 旧「顧客ステータス」(カンバン・移行前)で手で記録していた進み具合。
 * システムに契約書・初回請求書が無いまま手で進めていた過去のお客様を、受注管理で引き継ぐために使う。
 */
export interface LegacyOnboardingProgress {
  /** 旧画面で最後に置いていたステージ(表示用。例:「入金チェック」) */
  stageLabel: string;
  /** 契約は済んでいた(旧画面で「初回請求」以降に進めていた) */
  contractDone: boolean;
  /** 初回請求書の発行・送付は済んでいた(旧画面で「振替手続き」以降に進めていた) */
  invoiceIssued: boolean;
  /** 初回入金の確認は済んでいた(旧画面で「運用中」まで進めていた) */
  paymentChecked: boolean;
}

/** ステージ移動の履歴(カードのタイムライン表示用) */
export interface OnboardingStageEvent {
  stage: OnboardingStage;
  at: string;
  by: string;
}

/** 顧客ごとのオンボーディングカード(顧客1件につき1枚。顧客登録時に自動作成) */
export interface CustomerOnboarding {
  id: string;
  customerId: string;
  stage: OnboardingStage;
  /** 列内の並び順(小さいほど上)。ドラッグで入れ替える。 */
  sortOrder: number;
  /** フォロー期日(超過すると要対応として強調) */
  dueDate: string | null;
  /** 次にやること(担当者のメモ) */
  nextAction: string;
  checklist: OnboardingChecklistItem[];
  /** 現在のステージに入った日時(滞留日数の表示用) */
  stageChangedAt: string;
  history: OnboardingStageEvent[];
  /** 旧「顧客ステータス」から引き継ぐ進み具合(受注管理になってから作った案件は null) */
  legacy: LegacyOnboardingProgress | null;
  createdAt: string;
  updatedAt: string;
}

/* ---- アカウント(プロフィール) ---- */

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  /** 主ロール(後方互換。roles の先頭と一致させる) */
  role: Role;
  /** 保有ロール(兼務可)。正規化済み(旧種別は読み替え済み)。 */
  roles: Role[];
  /**
   * 開発スケジュール表を閲覧できるか(管理者がチェックで付け外しする)。
   * 管理者は常に閲覧できるため、この値に関わらず表示される。
   */
  scheduleVisible: boolean;
  createdAt: string;
}

/* ---- 削除・復元(ゴミ箱) ---- */

/**
 * 削除(非表示)と復元ができるデータの種別。
 * 実データは消さず deletedAt を立てるだけなので、いつでも元に戻せる。
 */
export type DeletableEntity =
  | "invoice"
  | "customer"
  | "payment"
  | "subscription"
  | "bank_transaction"
  | "batch";

/** ゴミ箱に入っている1件 */
export interface DeletedRecord {
  entity: DeletableEntity;
  id: string;
  /** 見出し(請求書番号・顧客名など) */
  label: string;
  /** 補足(金額・日付など) */
  sublabel: string;
  deletedAt: string;
  deletedBy: string;
  reason: string;
}

/** 削除・復元の操作ログ(追記のみ) */
export interface DataDeletionLog {
  id: string;
  entity: DeletableEntity;
  entityId: string;
  entityLabel: string;
  action: "delete" | "restore";
  actor: string;
  reason: string;
  createdAt: string;
}
