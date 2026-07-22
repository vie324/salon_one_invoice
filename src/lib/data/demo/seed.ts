import type {
  Activity,
  Agency,
  AgencyMember,
  BankTransaction,
  Contract,
  ContractEvent,
  ContractTemplate,
  Customer,
  DirectDebitBatch,
  DirectDebitMandate,
  Invoice,
  Organization,
  Payment,
  Plan,
  PlanOption,
  Subscription,
} from "@/lib/domain/types";

export interface DataStore {
  organization: Organization;
  customers: Customer[];
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
    registrationNumber: "",
    bankName: "",
    bankBranch: "",
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
  };
}
