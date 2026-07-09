import { calcInvoiceTotals, subscriptionItems } from "@/lib/domain/calculations";
import type {
  Activity,
  BankTransaction,
  Customer,
  DirectDebitBatch,
  DirectDebitBatchItem,
  DirectDebitMandate,
  Invoice,
  InvoiceItem,
  Organization,
  Payment,
  Plan,
  PlanOption,
  Subscription,
} from "@/lib/domain/types";
import { toISODate } from "@/lib/utils";

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
}

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const firstOfMonth = (base: Date, monthsAgo: number) =>
  new Date(base.getFullYear(), base.getMonth() - monthsAgo, 1);
const dayOfMonth = (base: Date, monthsAgo: number, day: number) => {
  const d = new Date(base.getFullYear(), base.getMonth() - monthsAgo, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), Math.min(day, last)));
};

const opt = (key: string, name: string, monthly: number): PlanOption => ({ key, name, monthly });
const HPB = (m: number) => opt("hpb", "HPB・ミニモ連携", m);
const LINE = (m: number) => opt("line", "LINE連携", m);

/**
 * デモ用のサンプルデータ。実行時の「今日」を基準に直近6ヶ月ぶんを生成する。
 * 料金体系: 基本料金(初期費用＋月額) ＋ オプション(HPB・ミニモ / LINE)。月額/年間の2区分。
 */
export function buildSeed(now = new Date()): DataStore {
  const organization: Organization = {
    id: "org_salon_one",
    name: "SalonOne株式会社",
    postalCode: "150-0001",
    address: "東京都渋谷区神宮前1-2-3 SalonOneビル 4F",
    tel: "03-1234-5678",
    email: "billing@salon-one.example.jp",
    registrationNumber: "T1234567890123",
    bankName: "みずほ銀行",
    bankBranch: "渋谷支店",
    bankAccountType: "普通",
    bankAccountNumber: "1234567",
    bankAccountHolder: "サロンワン(カ",
    invoicePrefix: "INV",
    defaultTaxRate: 0.1,
    logoText: "S1",
  };

  // 料金プラン(基本料金＋オプション / 月額・年間) — 添付の料金表に準拠
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
    taxRate: 0,
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
  const planById = new Map(plans.map((p) => [p.id, p]));

  // 顧客(=導入サロン)。planId/optionKeys で契約プランとオプションを紐付け。
  const customerDefs: (Omit<Customer, "createdAt"> & {
    planId: string | null;
    optionKeys: string[];
    mandateStatus: DirectDebitMandate["status"] | null;
  })[] = [
    { id: "cus_yamada", code: "S-0001", name: "Hair & Spa LUCE", kana: "ヘアアンドスパルーチェ", contactName: "山田 花子", email: "luce@example.com", phone: "03-1111-0001", postalCode: "150-0002", address: "東京都渋谷区渋谷2-1-1", paymentMethod: "direct_debit", status: "active", assignee: "佐々木 涼", notes: "定価プラン。オプション全部。", planId: "plan_teika_m", optionKeys: ["hpb", "line"], mandateStatus: "active" },
    { id: "cus_sato", code: "S-0002", name: "beauty room clover", kana: "ビューティルームクローバー", contactName: "佐藤 美咲", email: "clover@example.com", phone: "03-1111-0002", postalCode: "153-0051", address: "東京都目黒区上目黒3-4-5", paymentMethod: "direct_debit", status: "active", assignee: "田村 彩", notes: "", planId: "plan_pack_m", optionKeys: ["hpb", "line"], mandateStatus: "active" },
    { id: "cus_suzuki", code: "S-0003", name: "nail atelier Miel", kana: "ネイルアトリエミエル", contactName: "鈴木 陽菜", email: "miel@example.com", phone: "03-1111-0003", postalCode: "154-0004", address: "東京都世田谷区太子堂1-2-3", paymentMethod: "direct_debit", status: "active", assignee: "佐々木 涼", notes: "特別期間限定。HPBのみ。", planId: "plan_special_m", optionKeys: ["hpb"], mandateStatus: "active" },
    { id: "cus_tanaka", code: "S-0004", name: "barber shop SHIRO", kana: "バーバーショップシロ", contactName: "田中 健一", email: "shiro@example.com", phone: "03-1111-0004", postalCode: "141-0031", address: "東京都品川区西五反田2-3-4", paymentMethod: "direct_debit", status: "active", assignee: "田村 彩", notes: "代理店経由。", planId: "plan_agency_m", optionKeys: ["hpb", "line"], mandateStatus: "active" },
    { id: "cus_takahashi", code: "S-0005", name: "salon de Fleur", kana: "サロンドフルール", contactName: "高橋 由美", email: "fleur@example.com", phone: "03-1111-0005", postalCode: "158-0094", address: "東京都世田谷区玉川3-5-6", paymentMethod: "bank_transfer", status: "active", assignee: "佐々木 涼", notes: "振込希望（口座振替へ切替案内中）。年間プラン。", planId: "plan_teika_a", optionKeys: ["hpb", "line"], mandateStatus: null },
    { id: "cus_ito", code: "S-0006", name: "Relaxation Aoi", kana: "リラクゼーションアオイ", contactName: "伊藤 さくら", email: "aoi@example.com", phone: "03-1111-0006", postalCode: "150-0043", address: "東京都渋谷区道玄坂1-1-1", paymentMethod: "direct_debit", status: "active", assignee: "田村 彩", notes: "年間・LINEのみ。", planId: "plan_special_a", optionKeys: ["line"], mandateStatus: "active" },
    { id: "cus_watanabe", code: "S-0007", name: "Total Beauty NOA", kana: "トータルビューティノア", contactName: "渡辺 真理", email: "noa@example.com", phone: "03-1111-0007", postalCode: "151-0053", address: "東京都渋谷区代々木2-2-2", paymentMethod: "direct_debit", status: "active", assignee: "佐々木 涼", notes: "口座振替の登録手続き中。導入直後。", planId: "plan_pack_a", optionKeys: ["hpb", "line"], mandateStatus: "pending" },
    { id: "cus_nakamura", code: "S-0008", name: "men's grooming AXIS", kana: "メンズグルーミングアクシス", contactName: "中村 大輔", email: "axis@example.com", phone: "03-1111-0008", postalCode: "160-0022", address: "東京都新宿区新宿5-6-7", paymentMethod: "credit_card", status: "active", assignee: "田村 彩", notes: "カード決済。年間・代理店版。", planId: "plan_agency_a", optionKeys: ["hpb", "line"], mandateStatus: null },
    { id: "cus_kobayashi", code: "S-0009", name: "eyelash studio Lien", kana: "アイラッシュスタジオリアン", contactName: "小林 あさひ", email: "lien@example.com", phone: "03-1111-0009", postalCode: "170-0013", address: "東京都豊島区東池袋1-3-5", paymentMethod: "direct_debit", status: "active", assignee: "佐々木 涼", notes: "先月の口座振替が残高不足で失敗。要フォロー。", planId: "plan_special_m", optionKeys: ["hpb", "line"], mandateStatus: "failed" },
    { id: "cus_kato", code: "S-0010", name: "hair design Grace", kana: "ヘアデザイングレース", contactName: "加藤 麻衣", email: "grace@example.com", phone: "03-1111-0010", postalCode: "150-0021", address: "東京都渋谷区恵比寿西1-2-3", paymentMethod: "direct_debit", status: "active", assignee: "田村 彩", notes: "定価プラン。", planId: "plan_teika_m", optionKeys: ["hpb", "line"], mandateStatus: "active" },
    { id: "cus_beauty", code: "A-0001", name: "株式会社ビューティ・パートナーズ", kana: "カブシキガイシャビューティパートナーズ", contactName: "経理部 三浦", email: "keiri@beautypartners.example.co.jp", phone: "03-9876-5432", postalCode: "104-0061", address: "東京都中央区銀座4-5-6", paymentMethod: "bank_transfer", status: "active", assignee: "佐々木 涼", notes: "代理店（複数サロンを取りまとめ）。月末締め翌月末払い。", planId: null, optionKeys: [], mandateStatus: null },
  ];

  const customers: Customer[] = customerDefs.map((c, i) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    kana: c.kana,
    contactName: c.contactName,
    email: c.email,
    phone: c.phone,
    postalCode: c.postalCode,
    address: c.address,
    paymentMethod: c.paymentMethod,
    status: c.status,
    assignee: c.assignee,
    notes: c.notes,
    createdAt: toISODate(firstOfMonth(now, 7 + (i % 3))),
  }));

  const banks = ["三菱UFJ銀行", "三井住友銀行", "みずほ銀行", "りそな銀行", "ゆうちょ銀行"];
  const mandates: DirectDebitMandate[] = customerDefs
    .filter((c) => c.mandateStatus)
    .map((c, i) => ({
      id: `man_${c.id}`,
      customerId: c.id,
      bankName: banks[i % banks.length],
      branchName: `${["渋谷", "新宿", "目黒", "品川", "池袋"][i % 5]}支店`,
      branchCode: String(100 + i * 3).padStart(3, "0"),
      accountType: "普通",
      accountNumber: String(1000000 + i * 13579),
      accountHolderKana: c.kana,
      status: c.mandateStatus!,
      registeredAt:
        c.mandateStatus === "pending" ? null : toISODate(firstOfMonth(now, 6)),
    }));

  const subscriptions: Subscription[] = customerDefs
    .filter((c) => c.planId)
    .map((c) => ({
      id: `sub_${c.id}`,
      customerId: c.id,
      planId: c.planId!,
      status: "active",
      startedOn: toISODate(firstOfMonth(now, 6)),
      nextBillingDate: dayOfMonth(now, -1, 27),
      billingDay: 27,
      canceledOn: null,
      optionKeys: c.optionKeys,
    }));

  // --- 請求書 + 入金 + 活動 ---
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const activities: Activity[] = [];
  const seqByMonth = new Map<string, number>();
  const invNo = (issueDate: string) => {
    const d = new Date(issueDate);
    const key = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    const n = (seqByMonth.get(key) ?? 0) + 1;
    seqByMonth.set(key, n);
    return `INV-${key}-${String(n).padStart(4, "0")}`;
  };
  const withIds = (raw: Omit<InvoiceItem, "id">[], prefix: string): InvoiceItem[] =>
    raw.map((r, i) => ({ ...r, id: `${prefix}_it${i + 1}` }));

  function pushInvoice(inv: Invoice, payment?: Payment) {
    invoices.push(inv);
    if (payment) payments.push(payment);
  }

  // 6ヶ月分の定期請求(基本料金＋オプション)。当月は入金待ち。
  for (let m = 5; m >= 0; m--) {
    const period = ym(firstOfMonth(now, m));
    const issueDate = dayOfMonth(now, m, 1);
    const dueDate = dayOfMonth(now, m, 27);
    for (const sub of subscriptions) {
      const plan = planById.get(sub.planId)!;
      const cus = customerDefs.find((c) => c.id === sub.customerId)!;
      const items = withIds(
        subscriptionItems(plan, sub.optionKeys, period),
        `inv_${sub.customerId}_${period}`,
      );
      const totals = calcInvoiceTotals(items);
      const id = `inv_${sub.customerId}_${period}`;
      const number = invNo(issueDate);

      let status: Invoice["status"] = m === 0 ? "awaiting_payment" : "paid";
      let amountPaid = m === 0 ? 0 : totals.total;
      let paidAt: string | null = m === 0 ? null : dayOfMonth(now, m, 27);

      if (cus.paymentMethod === "credit_card" && m === 0) {
        status = "paid";
        amountPaid = totals.total;
        paidAt = dayOfMonth(now, 0, 2);
      }
      if (cus.id === "cus_kobayashi" && m === 0) {
        status = "failed";
        amountPaid = 0;
        paidAt = null;
      }
      if (cus.id === "cus_takahashi" && m === 1) {
        status = "overdue";
        amountPaid = 0;
        paidAt = null;
      }
      if (cus.id === "cus_watanabe" && m === 0) {
        status = "sent";
        amountPaid = 0;
        paidAt = null;
      }

      pushInvoice(
        {
          id,
          invoiceNumber: number,
          customerId: sub.customerId,
          subscriptionId: sub.id,
          type: "recurring",
          status,
          issueDate,
          dueDate,
          billingPeriod: period,
          paymentMethod: cus.paymentMethod,
          items,
          subtotal: totals.subtotal,
          taxTotal: totals.taxTotal,
          total: totals.total,
          amountPaid,
          notes: "",
          sentAt: dayOfMonth(now, m, 1),
          paidAt,
          createdAt: issueDate,
        },
        status === "paid"
          ? {
              id: `pay_${id}`,
              invoiceId: id,
              customerId: sub.customerId,
              amount: totals.total,
              method: cus.paymentMethod,
              status: "confirmed",
              paidAt: paidAt!,
              reference:
                cus.paymentMethod === "direct_debit"
                  ? "口座振替"
                  : cus.paymentMethod === "credit_card"
                    ? "カード決済"
                    : cus.name,
              matchedBy: cus.paymentMethod === "bank_transfer" ? "csv" : "auto",
              memo: "",
              createdAt: paidAt!,
            }
          : undefined,
      );
    }
  }

  // 初期費用の単発請求(導入時) — プランの initialFee。振込で入金消込のデモにも使う。
  const initialDefs = [
    { cus: "cus_watanabe", m: 0, paid: false },
    { cus: "cus_kato", m: 2, paid: true },
    { cus: "cus_tanaka", m: 4, paid: true },
  ];
  for (const def of initialDefs) {
    const cus = customerDefs.find((c) => c.id === def.cus)!;
    const plan = cus.planId ? planById.get(cus.planId)! : null;
    const fee = plan?.initialFee ?? 100000;
    const issueDate = dayOfMonth(now, def.m, 3);
    const dueDate = dayOfMonth(now, def.m, 20);
    const items = withIds(
      [
        { description: "初期費用（初期設定・導入サポート）", quantity: 1, unitPrice: fee, taxRate: 0, amount: fee },
      ],
      `ini_${def.cus}`,
    );
    const totals = calcInvoiceTotals(items);
    const id = `ini_${def.cus}`;
    pushInvoice(
      {
        id,
        invoiceNumber: invNo(issueDate),
        customerId: def.cus,
        subscriptionId: null,
        type: "initial",
        status: def.paid ? "paid" : "sent",
        issueDate,
        dueDate,
        billingPeriod: null,
        paymentMethod: "bank_transfer",
        items,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        amountPaid: def.paid ? totals.total : 0,
        notes: "初期費用は銀行振込にてお願いいたします。",
        sentAt: issueDate,
        paidAt: def.paid ? dayOfMonth(now, def.m, 12) : null,
        createdAt: issueDate,
      },
      def.paid
        ? {
            id: `pay_${id}`,
            invoiceId: id,
            customerId: def.cus,
            amount: totals.total,
            method: "bank_transfer",
            status: "confirmed",
            paidAt: dayOfMonth(now, def.m, 12),
            reference: cus.name,
            matchedBy: "csv",
            memo: "初期費用",
            createdAt: dayOfMonth(now, def.m, 12),
          }
        : undefined,
    );
  }

  // 代理店(ビューティ・パートナーズ)への単発請求 — スポット導入支援
  for (let m = 2; m >= 1; m--) {
    const period = ym(firstOfMonth(now, m));
    const issueDate = dayOfMonth(now, m, 25);
    const dueDate = dayOfMonth(now, m - 1, 27);
    const qty = m === 1 ? 3 : 2;
    const items = withIds(
      [{ description: `スポット導入支援（${period}・${qty}店舗分）`, quantity: qty, unitPrice: 30000, taxRate: 0.1, amount: qty * 30000 }],
      `inv_beauty_${period}`,
    );
    const totals = calcInvoiceTotals(items);
    const id = `inv_beauty_${period}`;
    const paid = m >= 2;
    pushInvoice(
      {
        id,
        invoiceNumber: invNo(issueDate),
        customerId: "cus_beauty",
        subscriptionId: null,
        type: "one_time",
        status: paid ? "paid" : "sent",
        issueDate,
        dueDate,
        billingPeriod: period,
        paymentMethod: "bank_transfer",
        items,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        amountPaid: paid ? totals.total : 0,
        notes: "月末締め翌月末払い。",
        sentAt: issueDate,
        paidAt: paid ? dayOfMonth(now, m - 1, 27) : null,
        createdAt: issueDate,
      },
      paid
        ? {
            id: `pay_${id}`,
            invoiceId: id,
            customerId: "cus_beauty",
            amount: totals.total,
            method: "bank_transfer",
            status: "confirmed",
            paidAt: dayOfMonth(now, m - 1, 27),
            reference: "カ)ビューティパートナーズ",
            matchedBy: "csv",
            memo: "",
            createdAt: dayOfMonth(now, m - 1, 27),
          }
        : undefined,
    );
  }

  // --- 引き落としバッチ ---
  const batches: DirectDebitBatch[] = [];
  const lastMonthDdInvoices = invoices.filter(
    (inv) =>
      inv.paymentMethod === "direct_debit" &&
      inv.billingPeriod === ym(firstOfMonth(now, 1)) &&
      inv.type === "recurring",
  );
  const lastBatchItems: DirectDebitBatchItem[] = lastMonthDdInvoices.map((inv) => ({
    id: `bi_${inv.id}`,
    batchId: "batch_last",
    invoiceId: inv.id,
    customerId: inv.customerId,
    mandateId: `man_${inv.customerId}`,
    amount: inv.total,
    result: inv.status === "paid" ? "success" : "failed",
    resultReason: inv.status === "paid" ? "" : "残高不足",
  }));
  batches.push({
    id: "batch_last",
    name: `${ym(firstOfMonth(now, 1))} 口座振替`,
    scheduledDate: dayOfMonth(now, 1, 27),
    status: "completed",
    createdAt: dayOfMonth(now, 1, 20),
    items: lastBatchItems,
  });

  const thisMonthDdInvoices = invoices.filter(
    (inv) =>
      inv.paymentMethod === "direct_debit" &&
      inv.billingPeriod === ym(firstOfMonth(now, 0)) &&
      (inv.status === "awaiting_payment" || inv.status === "failed"),
  );
  batches.push({
    id: "batch_this",
    name: `${ym(firstOfMonth(now, 0))} 口座振替`,
    scheduledDate: dayOfMonth(now, 0, 27),
    status: "submitted",
    createdAt: dayOfMonth(now, 0, 20),
    items: thisMonthDdInvoices.map((inv) => ({
      id: `bi_${inv.id}`,
      batchId: "batch_this",
      invoiceId: inv.id,
      customerId: inv.customerId,
      mandateId: `man_${inv.customerId}`,
      amount: inv.total,
      result: "pending",
      resultReason: "",
    })),
  });

  // --- 銀行明細(入金消込) ---
  const bankTransactions: BankTransaction[] = [];
  const watanabeInitial = invoices.find((i) => i.id === "ini_cus_watanabe");
  if (watanabeInitial) {
    bankTransactions.push({
      id: "bt_watanabe",
      transactionDate: dayOfMonth(now, 0, 5),
      amount: watanabeInitial.total,
      payerName: "トータルビューティノア",
      description: "振込 トータルビューティノア",
      matchedInvoiceId: null,
      matchedPaymentId: null,
      importedAt: dayOfMonth(now, 0, 6),
    });
  }
  const takahashiThis = invoices.find(
    (i) => i.customerId === "cus_takahashi" && i.billingPeriod === ym(firstOfMonth(now, 0)),
  );
  if (takahashiThis) {
    bankTransactions.push({
      id: "bt_takahashi",
      transactionDate: dayOfMonth(now, 0, 8),
      amount: takahashiThis.total,
      payerName: "サロンドフルール",
      description: "振込 サロンドフルール",
      matchedInvoiceId: null,
      matchedPaymentId: null,
      importedAt: dayOfMonth(now, 0, 8),
    });
  }
  bankTransactions.push({
    id: "bt_unknown",
    transactionDate: dayOfMonth(now, 0, 4),
    amount: 3300,
    payerName: "ﾃﾞﾝｷﾀﾞｲ",
    description: "口座振替 電気代",
    matchedInvoiceId: null,
    matchedPaymentId: null,
    importedAt: dayOfMonth(now, 0, 6),
  });

  // --- 活動ログ ---
  const recent = [...invoices].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const custName = (id: string) => customers.find((c) => c.id === id)?.name ?? id;
  activities.push(
    {
      id: "act_1",
      kind: "batch_processed",
      message: `${ym(firstOfMonth(now, 1))} の口座振替バッチを処理（成功 ${lastBatchItems.filter((i) => i.result === "success").length}件 / 失敗 ${lastBatchItems.filter((i) => i.result === "failed").length}件）`,
      actor: "システム",
      createdAt: dayOfMonth(now, 1, 27) + "T09:00:00",
      amount: lastBatchItems.filter((i) => i.result === "success").reduce((s, i) => s + i.amount, 0),
      linkInvoiceId: null,
    },
    {
      id: "act_2",
      kind: "payment_confirmed",
      message: `${custName("cus_kato")} の初期費用を入金確認`,
      actor: "田村 彩",
      createdAt: dayOfMonth(now, 2, 12) + "T11:20:00",
      amount: 200000,
      linkInvoiceId: "ini_cus_kato",
    },
    {
      id: "act_3",
      kind: "invoice_sent",
      message: `${custName("cus_beauty")} へ請求書を送付`,
      actor: "佐々木 涼",
      createdAt: dayOfMonth(now, 1, 25) + "T15:00:00",
      amount: null,
      linkInvoiceId: recent.find((i) => i.customerId === "cus_beauty")?.id ?? null,
    },
    {
      id: "act_4",
      kind: "customer_created",
      message: `新規導入 ${custName("cus_watanabe")} を登録`,
      actor: "佐々木 涼",
      createdAt: dayOfMonth(now, 0, 3) + "T10:10:00",
      amount: null,
      linkInvoiceId: null,
    },
  );

  return {
    organization,
    customers,
    mandates,
    plans,
    subscriptions,
    invoices,
    payments,
    batches,
    bankTransactions,
    activities,
  };
}
