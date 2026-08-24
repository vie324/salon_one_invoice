import type {
  Activity,
  Agency,
  AgencyMember,
  AppNotification,
  Application,
  ApplicationLink,
  BankTransaction,
  Contract,
  ContractEvent,
  ContractTemplate,
  Customer,
  CustomerOnboarding,
  DataDeletionLog,
  DevIssue,
  DevIssueAttachment,
  DirectDebitBatch,
  DirectDebitMandate,
  Invoice,
  Organization,
  Payment,
  Plan,
  PlanOption,
  Subscription,
  UserProfile,
} from "@/lib/domain/types";

export interface DataStore {
  organization: Organization;
  customers: Customer[];
  /** 顧客ステータス管理(カンバン)のカード。listOnboardings で顧客ごとに自動作成される */
  onboardings: CustomerOnboarding[];
  mandates: DirectDebitMandate[];
  plans: Plan[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  payments: Payment[];
  batches: DirectDebitBatch[];
  bankTransactions: BankTransaction[];
  activities: Activity[];
  contractTemplates: ContractTemplate[];
  contracts: Contract[];
  contractEvents: ContractEvent[];
  agencies: Agency[];
  agencyMembers: AgencyMember[];
  profiles: UserProfile[];
  devIssues: DevIssue[];
  devIssueAttachments: DevIssueAttachment[];
  applicationLinks: ApplicationLink[];
  applications: Application[];
  notifications: AppNotification[];
  /** 削除・復元の操作ログ(追記のみ) */
  deletionLogs: DataDeletionLog[];
  /** 開発依頼の連番採番 (#1 から) */
  devIssueSeq: number;
}

/**
 * デモモードのアカウント。右上の切替で各役割になりきれる。
 * 要望の承諾フローを試せるよう、承認者(管理者)は2名用意する。
 * 田中は請求管理者と開発・修正管理者の兼務例。
 */
export const DEMO_PROFILES: UserProfile[] = [
  {
    id: "demo-admin-1",
    name: "佐々木 涼",
    email: "sasaki@salon-one.example.jp",
    role: "admin",
    roles: ["admin"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "demo-admin-2",
    name: "高橋 誠",
    email: "takahashi@salon-one.example.jp",
    role: "admin",
    roles: ["admin"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    // 請求管理者と開発・修正管理者の兼務(重複チェックの表示例)
    id: "demo-billing-1",
    name: "田中 美咲",
    email: "tanaka@salon-one.example.jp",
    role: "billing",
    roles: ["billing", "dev_manager"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "demo-dev-1",
    name: "山田 健",
    email: "yamada@salon-one.example.jp",
    role: "engineer",
    roles: ["engineer"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "demo-devmgr-1",
    name: "小林 直樹",
    email: "kobayashi@salon-one.example.jp",
    role: "dev_manager",
    roles: ["dev_manager"],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

/**
 * デモモードで cookie のペルソナ値からなりきるアカウントIDを決める(旧ロールも許容)。
 * "admin2" は2人目のプロダクト管理者(実行有無の2名承諾を試すため)。
 */
export function demoProfileIdForRole(role: string | undefined): string {
  const map: Record<string, string> = {
    admin: "demo-admin-1",
    admin2: "demo-admin-2",
    owner: "demo-admin-1",
    billing: "demo-billing-1",
    staff: "demo-billing-1",
    dev: "demo-dev-1",
    engineer: "demo-dev-1",
    dev_manager: "demo-devmgr-1",
  };
  return map[role ?? "admin"] ?? "demo-admin-1";
}

const opt = (key: string, name: string, monthly: number): PlanOption => ({ key, name, monthly });
const HPB = (m: number) => opt("hpb", "HPB・ミニモ連携", m);
const LINE = (m: number) => opt("line", "LINE連携", m);

/**
 * 初期データ。顧客・請求・入金・契約などの業務データは空の状態で開始する
 * (テスト用のサンプルデータは投入しない)。
 * 自社情報と料金プラン(実際の料金表)のみ初期値として持つ。
 * 契約書テンプレートは初回アクセス時にリポジトリ側で自動投入される。
 */
export function buildSeed(): DataStore {
  const organization: Organization = {
    id: "org_salon_one",
    name: "株式会社サロンワン",
    postalCode: "",
    address: "東京都大田区蒲田５丁目７−４　エンゼルハイム蒲田第5　1101号室",
    tel: "",
    email: "",
    registrationNumber: "T2010801037576",
    bankName: "",
    bankBranch: "",
    bankBranchCode: "",
    bankAccountType: "普通",
    bankAccountNumber: "",
    bankAccountHolder: "",
    invoicePrefix: "INV",
    defaultTaxRate: 0.1,
    logoText: "S1",
  };

  // 料金プラン(基本料金＋オプション / 月額・年間) — 料金表に準拠
  const P = (
    id: string,
    name: string,
    term: "monthly" | "annual",
    initialFee: number,
    amount: number,
    options: PlanOption[],
    description: string,
  ): Plan => ({
    id,
    name,
    description,
    amount,
    taxRate: 0.1, // 金額は税抜。消費税10%を加算して請求。
    billingCycle: "monthly",
    billingDay: 27,
    active: true,
    initialFee,
    term,
    options,
  });

  const plans: Plan[] = [
    // 月額プラン
    P("plan_teika_m", "定価", "monthly", 200000, 30000, [HPB(10000), LINE(10000)], "標準プラン（月額）"),
    P("plan_pack_m", "まとめパック", "monthly", 200000, 30000, [HPB(7500), LINE(7500)], "オプションまとめ割（月額）"),
    P("plan_special_m", "特別期間限定", "monthly", 50000, 5000, [HPB(5000), LINE(5000)], "期間限定キャンペーン（月額）"),
    P("plan_agency_m", "代理店版 特別", "monthly", 100000, 20000, [HPB(5000), LINE(5000)], "代理店向け特別（月額）"),
    // 年間プラン
    P("plan_teika_a", "定価", "annual", 100000, 20000, [HPB(5000), LINE(5000)], "標準プラン（年間）"),
    P("plan_pack_a", "まとめパック", "annual", 100000, 20000, [HPB(2500), LINE(2500)], "オプションまとめ割（年間）"),
    P("plan_special_a", "特別期間限定", "annual", 50000, 5000, [HPB(2500), LINE(2500)], "期間限定キャンペーン（年間）"),
    P("plan_agency_a", "代理店版", "annual", 50000, 15000, [HPB(2500), LINE(2500)], "代理店向け（年間）"),
  ];

  return {
    organization,
    customers: [],
    onboardings: [],
    mandates: [],
    plans,
    subscriptions: [],
    invoices: [],
    payments: [],
    batches: [],
    bankTransactions: [],
    activities: [],
    contractTemplates: [],
    contracts: [],
    contractEvents: [],
    agencies: [],
    agencyMembers: [],
    // デモアカウントはマスタ扱いで投入(開発依頼・通知は空から開始)
    profiles: DEMO_PROFILES.map((p) => ({ ...p })),
    devIssues: [],
    devIssueAttachments: [],
    applicationLinks: [],
    applications: [],
    notifications: [],
    deletionLogs: [],
    devIssueSeq: 0,
  };
}
