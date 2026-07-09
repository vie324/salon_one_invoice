import { calcInvoiceTotals } from "@/lib/domain/calculations";
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

function buildItems(raw: Omit<InvoiceItem, "id" | "amount">[], prefix: string): InvoiceItem[] {
  return raw.map((r, i) => ({
    ...r,
    id: `${prefix}_it${i + 1}`,
    amount: Math.round(r.quantity * r.unitPrice),
  }));
}

/**
 * デモ用のサンプルデータを構築する。
 * 実行時の「今日」を基準に直近6ヶ月ぶんを生成するため、いつ見ても賑わって見える。
 */
export function buildSeed(now = new Date()): DataStore {
  const organization: Organization = {
    id: "org_salon_one",
    name: "サロン・ワン株式会社",
    postalCode: "150-0001",
    address: "東京都渋谷区神宮前1-2-3 サロンワンビル 4F",
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

  const plans: Plan[] = [
    {
      id: "plan_basic",
      name: "ベーシック会員",
      description: "月1回のメンテナンス施術＋ホームケア相談",
      amount: 8000,
      taxRate: 0.1,
      billingCycle: "monthly",
      billingDay: 27,
      active: true,
    },
    {
      id: "plan_standard",
      name: "スタンダード会員",
      description: "月2回の施術＋トリートメント込み",
      amount: 12000,
      taxRate: 0.1,
      billingCycle: "monthly",
      billingDay: 27,
      active: true,
    },
    {
      id: "plan_premium",
      name: "プレミアム会員",
      description: "通い放題＋指名料無料＋店販10%OFF",
      amount: 20000,
      taxRate: 0.1,
      billingCycle: "monthly",
      billingDay: 27,
      active: true,
    },
    {
      id: "plan_homecare",
      name: "ホームケア定期便",
      description: "毎月おすすめ店販品をお届け",
      amount: 5000,
      taxRate: 0.1,
      billingCycle: "monthly",
      billingDay: 27,
      active: true,
    },
  ];
  const planById = new Map(plans.map((p) => [p.id, p]));

  // 顧客定義 (planId は定期契約の紐付け用の作業データ)
  const customerDefs: (Omit<Customer, "createdAt"> & {
    planId: string | null;
    mandateStatus: DirectDebitMandate["status"] | null;
  })[] = [
    { id: "cus_yamada", code: "M-0001", name: "山田 花子", kana: "ヤマダ ハナコ", contactName: "山田 花子", email: "hanako.y@example.com", phone: "090-1111-0001", postalCode: "150-0002", address: "東京都渋谷区渋谷2-1-1", paymentMethod: "direct_debit", status: "active", assignee: "佐々木 涼", notes: "指名: 涼。敏感肌。", planId: "plan_premium", mandateStatus: "active" },
    { id: "cus_sato", code: "M-0002", name: "佐藤 美咲", kana: "サトウ ミサキ", contactName: "佐藤 美咲", email: "misaki.s@example.com", phone: "090-1111-0002", postalCode: "153-0051", address: "東京都目黒区上目黒3-4-5", paymentMethod: "direct_debit", status: "active", assignee: "田村 彩", notes: "", planId: "plan_standard", mandateStatus: "active" },
    { id: "cus_suzuki", code: "M-0003", name: "鈴木 陽菜", kana: "スズキ ヒナ", contactName: "鈴木 陽菜", email: "hina.s@example.com", phone: "090-1111-0003", postalCode: "154-0004", address: "東京都世田谷区太子堂1-2-3", paymentMethod: "direct_debit", status: "active", assignee: "佐々木 涼", notes: "", planId: "plan_basic", mandateStatus: "active" },
    { id: "cus_tanaka", code: "M-0004", name: "田中 健一", kana: "タナカ ケンイチ", contactName: "田中 健一", email: "kenichi.t@example.com", phone: "090-1111-0004", postalCode: "141-0031", address: "東京都品川区西五反田2-3-4", paymentMethod: "direct_debit", status: "active", assignee: "田村 彩", notes: "メンズ。朝の来店希望。", planId: "plan_standard", mandateStatus: "active" },
    { id: "cus_takahashi", code: "M-0005", name: "高橋 由美", kana: "タカハシ ユミ", contactName: "高橋 由美", email: "yumi.t@example.com", phone: "090-1111-0005", postalCode: "158-0094", address: "東京都世田谷区玉川3-5-6", paymentMethod: "bank_transfer", status: "active", assignee: "佐々木 涼", notes: "振込希望(口座振替への切替案内中)。", planId: "plan_premium", mandateStatus: null },
    { id: "cus_ito", code: "M-0006", name: "伊藤 さくら", kana: "イトウ サクラ", contactName: "伊藤 さくら", email: "sakura.i@example.com", phone: "090-1111-0006", postalCode: "150-0043", address: "東京都渋谷区道玄坂1-1-1", paymentMethod: "direct_debit", status: "active", assignee: "田村 彩", notes: "", planId: "plan_basic", mandateStatus: "active" },
    { id: "cus_watanabe", code: "M-0007", name: "渡辺 真理", kana: "ワタナベ マリ", contactName: "渡辺 真理", email: "mari.w@example.com", phone: "090-1111-0007", postalCode: "151-0053", address: "東京都渋谷区代々木2-2-2", paymentMethod: "direct_debit", status: "active", assignee: "佐々木 涼", notes: "口座振替の登録手続き中。", planId: "plan_homecare", mandateStatus: "pending" },
    { id: "cus_nakamura", code: "M-0008", name: "中村 大輔", kana: "ナカムラ ダイスケ", contactName: "中村 大輔", email: "daisuke.n@example.com", phone: "090-1111-0008", postalCode: "160-0022", address: "東京都新宿区新宿5-6-7", paymentMethod: "credit_card", status: "active", assignee: "田村 彩", notes: "カード決済。", planId: "plan_standard", mandateStatus: null },
    { id: "cus_kobayashi", code: "M-0009", name: "小林 あさひ", kana: "コバヤシ アサヒ", contactName: "小林 あさひ", email: "asahi.k@example.com", phone: "090-1111-0009", postalCode: "170-0013", address: "東京都豊島区東池袋1-3-5", paymentMethod: "direct_debit", status: "active", assignee: "佐々木 涼", notes: "先月の口座振替が残高不足で失敗。要フォロー。", planId: "plan_basic", mandateStatus: "failed" },
    { id: "cus_kato", code: "M-0010", name: "加藤 麻衣", kana: "カトウ マイ", contactName: "加藤 麻衣", email: "mai.k@example.com", phone: "090-1111-0010", postalCode: "150-0021", address: "東京都渋谷区恵比寿西1-2-3", paymentMethod: "direct_debit", status: "active", assignee: "田村 彩", notes: "", planId: "plan_premium", mandateStatus: "active" },
    { id: "cus_beauty", code: "C-0001", name: "株式会社ビューティラボ", kana: "カブシキガイシャビューティラボ", contactName: "経理部 三浦", email: "keiri@beautylab.example.co.jp", phone: "03-9876-5432", postalCode: "104-0061", address: "東京都中央区銀座4-5-6", paymentMethod: "bank_transfer", status: "active", assignee: "佐々木 涼", notes: "法人契約(社員向け福利厚生プラン)。月末締め翌月末払い。", planId: null, mandateStatus: null },
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

  // 定期契約
  const subscriptions: Subscription[] = customerDefs
    .filter((c) => c.planId)
    .map((c) => ({
      id: `sub_${c.id}`,
      customerId: c.id,
      planId: c.planId!,
      status: "active",
      startedOn: toISODate(firstOfMonth(now, 6)),
      nextBillingDate: dayOfMonth(now, -1, 27), // 翌月27日
      billingDay: 27,
      canceledOn: null,
    }));

  // --- 請求書 + 入金 + 活動 生成 ---
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

  function pushInvoice(inv: Invoice, payment?: Payment) {
    invoices.push(inv);
    if (payment) payments.push(payment);
  }

  // 6ヶ月分の定期請求 (5ヶ月前〜当月)。当月は入金待ち。
  for (let m = 5; m >= 0; m--) {
    const period = ym(firstOfMonth(now, m));
    const issueDate = dayOfMonth(now, m, 1);
    const dueDate = dayOfMonth(now, m, 27);
    for (const sub of subscriptions) {
      const plan = planById.get(sub.planId)!;
      const cus = customerDefs.find((c) => c.id === sub.customerId)!;
      const items = buildItems(
        [
          {
            description: `${plan.name}（${period}）`,
            quantity: 1,
            unitPrice: plan.amount,
            taxRate: plan.taxRate,
          },
        ],
        `inv_${sub.customerId}_${period}`,
      );
      const totals = calcInvoiceTotals(items);
      const id = `inv_${sub.customerId}_${period}`;
      const number = invNo(issueDate);

      // 既定は過去月=入金済 / 当月=入金待ち
      let status: Invoice["status"] = m === 0 ? "awaiting_payment" : "paid";
      let amountPaid = m === 0 ? 0 : totals.total;
      let paidAt: string | null = m === 0 ? null : dayOfMonth(now, m, 27);

      // クレジットカードは発行時に即時決済(当月の入金として計上)
      if (cus.paymentMethod === "credit_card" && m === 0) {
        status = "paid";
        amountPaid = totals.total;
        paidAt = dayOfMonth(now, 0, 2);
      }

      // 例外シナリオ
      if (cus.id === "cus_kobayashi" && m === 0) {
        status = "failed"; // 当月の口座振替が失敗
        amountPaid = 0;
        paidAt = null;
      }
      if (cus.id === "cus_takahashi" && m === 1) {
        status = "overdue"; // 振込顧客が前月分未入金 → 期限超過
        amountPaid = 0;
        paidAt = null;
      }
      if (cus.id === "cus_watanabe" && m === 0) {
        status = "sent"; // 口座振替登録中のため当月は請求書送付(振込案内)
        amountPaid = 0;
        paidAt = null;
      }

      const inv: Invoice = {
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
      };

      const payment: Payment | undefined =
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
          : undefined;
      pushInvoice(inv, payment);
    }
  }

  // 初期費用(入会金)の単発請求 — 振込。入金消込のデモに使う。
  const initialDefs = [
    { cus: "cus_watanabe", m: 0, paid: false }, // 未入金(消込前) → 銀行明細に振込あり
    { cus: "cus_kato", m: 2, paid: true },
    { cus: "cus_tanaka", m: 4, paid: true },
  ];
  for (const def of initialDefs) {
    const cus = customerDefs.find((c) => c.id === def.cus)!;
    const issueDate = dayOfMonth(now, def.m, 3);
    const dueDate = dayOfMonth(now, def.m, 20);
    const items = buildItems(
      [
        { description: "入会金", quantity: 1, unitPrice: 11000, taxRate: 0.1 },
        { description: "初回カウンセリング・カルテ作成", quantity: 1, unitPrice: 5000, taxRate: 0.1 },
      ],
      `ini_${def.cus}`,
    );
    const totals = calcInvoiceTotals(items);
    const id = `ini_${def.cus}`;
    const inv: Invoice = {
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
    };
    pushInvoice(
      inv,
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

  // 法人向け(ビューティラボ)の単発請求 — 福利厚生施術まとめ
  for (let m = 2; m >= 1; m--) {
    const period = ym(firstOfMonth(now, m));
    const issueDate = dayOfMonth(now, m, 25);
    const dueDate = dayOfMonth(now, m - 1, 27);
    const qty = m === 1 ? 12 : 9;
    const items = buildItems(
      [
        { description: `社員向け施術チケット（${period}利用分）`, quantity: qty, unitPrice: 6000, taxRate: 0.1 },
      ],
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
            reference: "カ)ビューティラボ",
            matchedBy: "csv",
            memo: "",
            createdAt: dayOfMonth(now, m - 1, 27),
          }
        : undefined,
    );
  }

  // --- 引き落としバッチ ---
  const batches: DirectDebitBatch[] = [];

  // 先月分: 完了済みバッチ
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

  // 当月分: 送信待ちバッチ(入金待ちの口座振替請求をまとめる)
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
  // 消込前の振込を含める(渡辺さんの入会金など)。
  const bankTransactions: BankTransaction[] = [];
  const watanabeInitial = invoices.find((i) => i.id === "ini_cus_watanabe");
  if (watanabeInitial) {
    bankTransactions.push({
      id: "bt_watanabe",
      transactionDate: dayOfMonth(now, 0, 5),
      amount: watanabeInitial.total,
      payerName: "ワタナベ マリ",
      description: "振込 ワタナベ マリ",
      matchedInvoiceId: null,
      matchedPaymentId: null,
      importedAt: dayOfMonth(now, 0, 6),
    });
  }
  // 高橋さん(振込・定期)の当月分入金 → 未消込
  const takahashiThis = invoices.find(
    (i) => i.customerId === "cus_takahashi" && i.billingPeriod === ym(firstOfMonth(now, 0)),
  );
  if (takahashiThis) {
    bankTransactions.push({
      id: "bt_takahashi",
      transactionDate: dayOfMonth(now, 0, 8),
      amount: takahashiThis.total,
      payerName: "タカハシ ユミ",
      description: "振込 タカハシ ユミ",
      matchedInvoiceId: null,
      matchedPaymentId: null,
      importedAt: dayOfMonth(now, 0, 8),
    });
  }
  // 用途不明の入金(照合対象外・少額) — 実運用の「よくある未照合」
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

  // --- 活動ログ(最近の動き) ---
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
      message: `${custName("cus_kato")} 様の入会金を入金確認`,
      actor: "田村 彩",
      createdAt: dayOfMonth(now, 2, 12) + "T11:20:00",
      amount: 17600,
      linkInvoiceId: "ini_cus_kato",
    },
    {
      id: "act_3",
      kind: "invoice_sent",
      message: `${custName("cus_beauty")} 様へ請求書を送付`,
      actor: "佐々木 涼",
      createdAt: dayOfMonth(now, 1, 25) + "T15:00:00",
      amount: null,
      linkInvoiceId: recent.find((i) => i.customerId === "cus_beauty")?.id ?? null,
    },
    {
      id: "act_4",
      kind: "customer_created",
      message: `新規会員 ${custName("cus_watanabe")} 様を登録`,
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
