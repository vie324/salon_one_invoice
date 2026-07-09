import {
  calcInvoiceTotals,
  computeNextBillingDate,
  effectiveStatus,
  nextInvoiceNumber,
  subscriptionItems,
} from "@/lib/domain/calculations";
import { computeDashboardMetrics } from "@/lib/domain/metrics";
import type {
  Activity,
  BankTransaction,
  Customer,
  CustomerStatus,
  DashboardMetrics,
  DirectDebitBatch,
  DirectDebitMandate,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceWithCustomer,
  Organization,
  Payment,
  Plan,
  Subscription,
} from "@/lib/domain/types";
import { genId, toISODate } from "@/lib/utils";
import type {
  BankRowInput,
  CustomerInput,
  InvoiceFilter,
  InvoiceInput,
  PaymentInput,
  PlanInput,
  Repository,
  StripeInvoiceInput,
  StripeSubscriptionInput,
  SubscriptionInput,
} from "../repository";
import { getStore } from "./store";

function decorate(inv: Invoice): Invoice {
  return { ...inv, status: effectiveStatus(inv) };
}

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** インメモリのデモ実装。Repository を完全に満たす。 */
export class DemoRepository implements Repository {
  private get s() {
    return getStore();
  }

  async getOrganization(): Promise<Organization> {
    return this.s.organization;
  }

  async listCustomers(filter?: { status?: CustomerStatus; search?: string }): Promise<Customer[]> {
    let list = [...this.s.customers];
    if (filter?.status) list = list.filter((c) => c.status === filter.status);
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.kana.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => a.code.localeCompare(b.code));
  }

  async getCustomer(id: string): Promise<Customer | null> {
    return this.s.customers.find((c) => c.id === id) ?? null;
  }

  async createCustomer(input: CustomerInput): Promise<Customer> {
    const code =
      input.code ||
      `M-${String(this.s.customers.length + 1).padStart(4, "0")}`;
    const customer: Customer = {
      id: genId("cus"),
      code,
      name: input.name,
      kana: input.kana ?? "",
      contactName: input.contactName ?? input.name,
      email: input.email ?? "",
      phone: input.phone ?? "",
      postalCode: input.postalCode ?? "",
      address: input.address ?? "",
      paymentMethod: input.paymentMethod,
      status: input.status ?? "active",
      assignee: input.assignee ?? "",
      notes: input.notes ?? "",
      createdAt: toISODate(new Date()),
    };
    this.s.customers.push(customer);
    this.addActivity({
      kind: "customer_created",
      message: `新規顧客 ${customer.name} 様を登録`,
      actor: input.assignee || "担当者",
    });
    return customer;
  }

  async updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer> {
    const c = this.s.customers.find((x) => x.id === id);
    if (!c) throw new Error("顧客が見つかりません");
    Object.assign(c, input);
    return c;
  }

  async getMandateByCustomer(customerId: string): Promise<DirectDebitMandate | null> {
    return this.s.mandates.find((m) => m.customerId === customerId) ?? null;
  }

  async listPlans(): Promise<Plan[]> {
    return [...this.s.plans];
  }

  async getPlan(id: string): Promise<Plan | null> {
    return this.s.plans.find((p) => p.id === id) ?? null;
  }

  async createPlan(input: PlanInput): Promise<Plan> {
    const plan: Plan = {
      id: genId("plan"),
      name: input.name,
      description: input.description ?? "",
      amount: input.amount,
      taxRate: input.taxRate,
      billingCycle: "monthly",
      billingDay: input.billingDay,
      active: input.active ?? true,
      initialFee: input.initialFee ?? 0,
      term: input.term ?? "monthly",
      options: input.options ?? [],
    };
    this.s.plans.push(plan);
    return plan;
  }

  async listSubscriptions(): Promise<Subscription[]> {
    return [...this.s.subscriptions];
  }

  async createSubscription(input: SubscriptionInput): Promise<Subscription> {
    const plan = this.s.plans.find((p) => p.id === input.planId);
    const billingDay = input.billingDay ?? plan?.billingDay ?? 27;
    const sub: Subscription = {
      id: genId("sub"),
      customerId: input.customerId,
      planId: input.planId,
      status: "active",
      startedOn: input.startedOn,
      nextBillingDate: computeNextBillingDate(input.startedOn, billingDay),
      billingDay,
      canceledOn: null,
      optionKeys: input.optionKeys ?? [],
    };
    this.s.subscriptions.push(sub);
    const cus = this.s.customers.find((c) => c.id === input.customerId);
    this.addActivity({
      kind: "subscription_created",
      message: `${cus?.name ?? ""} 様が ${plan?.name ?? "プラン"} に加入`,
      actor: "担当者",
    });
    return sub;
  }

  async updateSubscriptionStatus(
    id: string,
    status: Subscription["status"],
  ): Promise<Subscription> {
    const sub = this.s.subscriptions.find((x) => x.id === id);
    if (!sub) throw new Error("契約が見つかりません");
    sub.status = status;
    if (status === "canceled") sub.canceledOn = toISODate(new Date());
    return sub;
  }

  async listInvoices(filter?: InvoiceFilter): Promise<InvoiceWithCustomer[]> {
    let list = this.s.invoices.map(decorate);
    if (filter?.customerId) list = list.filter((i) => i.customerId === filter.customerId);
    if (filter?.type && filter.type !== "all") list = list.filter((i) => i.type === filter.type);
    if (filter?.paymentMethod && filter.paymentMethod !== "all") {
      list = list.filter((i) => i.paymentMethod === filter.paymentMethod);
    }
    if (filter?.status && filter.status !== "all") {
      list = list.filter((i) => i.status === filter.status);
    }
    const withCustomer = list.map((i) => ({
      ...i,
      customer: this.s.customers.find((c) => c.id === i.customerId)!,
    }));
    let result = withCustomer;
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(q) ||
          i.customer?.name.toLowerCase().includes(q),
      );
    }
    return result.sort((a, b) => (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : b.invoiceNumber.localeCompare(a.invoiceNumber)));
  }

  async getInvoice(id: string): Promise<InvoiceWithCustomer | null> {
    const inv = this.s.invoices.find((i) => i.id === id);
    if (!inv) return null;
    const customer = this.s.customers.find((c) => c.id === inv.customerId)!;
    return { ...decorate(inv), customer };
  }

  async createInvoice(input: InvoiceInput): Promise<Invoice> {
    const items: InvoiceItem[] = input.items.map((it) => ({
      id: genId("it"),
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      taxRate: it.taxRate,
      amount: Math.round(it.quantity * it.unitPrice),
    }));
    const totals = calcInvoiceTotals(items);
    const number = nextInvoiceNumber(
      this.s.organization.invoicePrefix,
      input.issueDate,
      this.s.invoices.map((i) => i.invoiceNumber),
    );
    const status: InvoiceStatus = input.status ?? "draft";
    const inv: Invoice = {
      id: genId("inv"),
      invoiceNumber: number,
      customerId: input.customerId,
      subscriptionId: input.subscriptionId ?? null,
      type: input.type,
      status,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      billingPeriod: input.billingPeriod ?? null,
      paymentMethod: input.paymentMethod,
      items,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      amountPaid: 0,
      notes: input.notes ?? "",
      sentAt: status !== "draft" ? toISODate(new Date()) : null,
      paidAt: null,
      createdAt: toISODate(new Date()),
    };
    this.s.invoices.push(inv);
    const cus = this.s.customers.find((c) => c.id === input.customerId);
    this.addActivity({
      kind: status === "draft" ? "invoice_created" : "invoice_sent",
      message:
        status === "draft"
          ? `${cus?.name ?? ""} 様の請求書 ${number} を作成`
          : `${cus?.name ?? ""} 様へ請求書 ${number} を送付`,
      actor: cus?.assignee || "担当者",
      amount: totals.total,
      linkInvoiceId: inv.id,
    });
    return inv;
  }

  async updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    const inv = this.s.invoices.find((i) => i.id === id);
    if (!inv) throw new Error("請求書が見つかりません");
    inv.status = status;
    if (status === "paid") {
      inv.amountPaid = inv.total;
      inv.paidAt = toISODate(new Date());
    }
    return inv;
  }

  async sendInvoice(id: string): Promise<Invoice> {
    const inv = this.s.invoices.find((i) => i.id === id);
    if (!inv) throw new Error("請求書が見つかりません");
    if (inv.status === "draft") {
      inv.status = inv.paymentMethod === "direct_debit" ? "awaiting_payment" : "sent";
    }
    inv.sentAt = toISODate(new Date());
    const cus = this.s.customers.find((c) => c.id === inv.customerId);
    this.addActivity({
      kind: "invoice_sent",
      message: `${cus?.name ?? ""} 様へ請求書 ${inv.invoiceNumber} を送付`,
      actor: cus?.assignee || "担当者",
      amount: inv.total,
      linkInvoiceId: inv.id,
    });
    return inv;
  }

  async listPayments(filter?: { customerId?: string }): Promise<Payment[]> {
    let list = [...this.s.payments];
    if (filter?.customerId) list = list.filter((p) => p.customerId === filter.customerId);
    return list.sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
  }

  async recordPayment(input: PaymentInput): Promise<Payment> {
    const payment: Payment = {
      id: genId("pay"),
      invoiceId: input.invoiceId ?? null,
      customerId: input.customerId,
      amount: input.amount,
      method: input.method,
      status: "confirmed",
      paidAt: input.paidAt,
      reference: input.reference ?? "",
      matchedBy: input.matchedBy ?? "manual",
      memo: input.memo ?? "",
      createdAt: toISODate(new Date()),
    };
    this.s.payments.push(payment);
    if (input.invoiceId) {
      const inv = this.s.invoices.find((i) => i.id === input.invoiceId);
      if (inv) {
        inv.amountPaid += input.amount;
        if (inv.amountPaid >= inv.total) {
          inv.status = "paid";
          inv.paidAt = input.paidAt;
        } else if (inv.amountPaid > 0) {
          inv.status = "partially_paid";
        }
      }
    }
    const cus = this.s.customers.find((c) => c.id === input.customerId);
    this.addActivity({
      kind: "payment_confirmed",
      message: `${cus?.name ?? ""} 様の入金を確認`,
      actor: "担当者",
      amount: input.amount,
      linkInvoiceId: input.invoiceId ?? null,
    });
    return payment;
  }

  async listBatches(): Promise<DirectDebitBatch[]> {
    return [...this.s.batches].sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1));
  }

  async getBatch(id: string): Promise<DirectDebitBatch | null> {
    return this.s.batches.find((b) => b.id === id) ?? null;
  }

  async createBatchFromAwaiting(scheduledDate: string): Promise<DirectDebitBatch> {
    const batched = new Set(
      this.s.batches.flatMap((b) => b.items.map((i) => i.invoiceId)),
    );
    const targets = this.s.invoices.filter(
      (inv) =>
        inv.paymentMethod === "direct_debit" &&
        (inv.status === "awaiting_payment" || inv.status === "sent") &&
        inv.amountPaid < inv.total &&
        !batched.has(inv.id),
    );
    const batch: DirectDebitBatch = {
      id: genId("batch"),
      name: `${ym(new Date(scheduledDate))} 口座振替`,
      scheduledDate,
      status: "draft",
      createdAt: toISODate(new Date()),
      items: targets.map((inv) => ({
        id: genId("bi"),
        batchId: "tmp",
        invoiceId: inv.id,
        customerId: inv.customerId,
        mandateId: this.s.mandates.find((m) => m.customerId === inv.customerId)?.id ?? null,
        amount: inv.total,
        result: "pending" as const,
        resultReason: "",
      })),
    };
    batch.items.forEach((it) => (it.batchId = batch.id));
    this.s.batches.push(batch);
    return batch;
  }

  async processBatch(id: string): Promise<DirectDebitBatch> {
    const batch = this.s.batches.find((b) => b.id === id);
    if (!batch) throw new Error("バッチが見つかりません");
    let success = 0;
    let failed = 0;
    for (const item of batch.items) {
      if (item.result !== "pending") continue;
      const mandate = this.s.mandates.find((m) => m.id === item.mandateId);
      const ok = mandate?.status === "active";
      if (ok) {
        item.result = "success";
        await this.recordPayment({
          invoiceId: item.invoiceId,
          customerId: item.customerId,
          amount: item.amount,
          method: "direct_debit",
          paidAt: batch.scheduledDate,
          reference: "口座振替",
          matchedBy: "auto",
        });
        success++;
      } else {
        item.result = "failed";
        item.resultReason = mandate ? "口座振替の登録が有効ではありません" : "残高不足";
        const inv = this.s.invoices.find((i) => i.id === item.invoiceId);
        if (inv) inv.status = "failed";
        failed++;
      }
    }
    batch.status = "completed";
    this.addActivity({
      kind: "batch_processed",
      message: `${batch.name} を処理（成功 ${success}件 / 失敗 ${failed}件）`,
      actor: "システム",
      amount: batch.items.filter((i) => i.result === "success").reduce((s, i) => s + i.amount, 0),
    });
    return batch;
  }

  async listBankTransactions(): Promise<BankTransaction[]> {
    return [...this.s.bankTransactions].sort((a, b) =>
      a.transactionDate < b.transactionDate ? 1 : -1,
    );
  }

  async importBankTransactions(rows: BankRowInput[]): Promise<BankTransaction[]> {
    const created = rows.map((r) => ({
      id: genId("bt"),
      transactionDate: r.transactionDate,
      amount: r.amount,
      payerName: r.payerName,
      description: r.description,
      matchedInvoiceId: null,
      matchedPaymentId: null,
      importedAt: toISODate(new Date()),
    }));
    this.s.bankTransactions.push(...created);
    return created;
  }

  async matchBankTransaction(txnId: string, invoiceId: string): Promise<void> {
    const txn = this.s.bankTransactions.find((t) => t.id === txnId);
    const inv = this.s.invoices.find((i) => i.id === invoiceId);
    if (!txn || !inv) throw new Error("対象が見つかりません");
    const payment = await this.recordPayment({
      invoiceId,
      customerId: inv.customerId,
      amount: txn.amount,
      method: "bank_transfer",
      paidAt: txn.transactionDate,
      reference: txn.payerName,
      matchedBy: "manual",
      memo: "銀行明細から消込",
    });
    txn.matchedInvoiceId = invoiceId;
    txn.matchedPaymentId = payment.id;
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return computeDashboardMetrics({
      invoices: this.s.invoices,
      payments: this.s.payments,
      subscriptions: this.s.subscriptions,
      plans: this.s.plans,
      customers: this.s.customers,
    });
  }

  async listActivities(limit = 12): Promise<Activity[]> {
    return [...this.s.activities]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  async runRecurringBilling(asOf?: string): Promise<{ created: Invoice[] }> {
    const asOfDate = asOf ?? toISODate(new Date());
    const created: Invoice[] = [];
    for (const sub of this.s.subscriptions) {
      if (sub.status !== "active") continue;
      // Stripe 管理の契約は Stripe 側が課金するため自前生成しない
      if (sub.stripeSubscriptionId) continue;
      if (sub.nextBillingDate > asOfDate) continue;
      const plan = this.s.plans.find((p) => p.id === sub.planId);
      if (!plan) continue;
      const period = ym(new Date(sub.nextBillingDate));
      // 二重生成防止
      const exists = this.s.invoices.some(
        (i) => i.subscriptionId === sub.id && i.billingPeriod === period,
      );
      if (exists) {
        sub.nextBillingDate = computeNextBillingDate(sub.nextBillingDate, sub.billingDay);
        continue;
      }
      const customer = this.s.customers.find((c) => c.id === sub.customerId);
      const inv = await this.createInvoice({
        customerId: sub.customerId,
        type: "recurring",
        issueDate: `${period}-01`,
        dueDate: sub.nextBillingDate,
        paymentMethod: customer?.paymentMethod ?? "direct_debit",
        billingPeriod: period,
        subscriptionId: sub.id,
        items: subscriptionItems(plan, sub.optionKeys ?? [], period),
        status: customer?.paymentMethod === "direct_debit" ? "awaiting_payment" : "sent",
      });
      created.push(inv);
      sub.nextBillingDate = computeNextBillingDate(sub.nextBillingDate, sub.billingDay);
    }
    return { created };
  }

  async linkStripeCustomer(customerId: string, stripeCustomerId: string): Promise<void> {
    const c = this.s.customers.find((x) => x.id === customerId);
    if (c) c.stripeCustomerId = stripeCustomerId;
  }

  async findCustomerByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null> {
    return this.s.customers.find((c) => c.stripeCustomerId === stripeCustomerId) ?? null;
  }

  async upsertStripeSubscription(input: StripeSubscriptionInput): Promise<Subscription> {
    const existing = this.s.subscriptions.find(
      (s) => s.stripeSubscriptionId === input.stripeSubscriptionId,
    );
    if (existing) {
      existing.status = input.status;
      if (input.status === "canceled") existing.canceledOn = toISODate(new Date());
      return existing;
    }
    let plan = this.s.plans.find((p) => p.name === input.planName);
    if (!plan) {
      plan = {
        id: genId("plan"),
        name: input.planName,
        description: "Stripe連携プラン",
        amount: input.amount,
        taxRate: 0,
        billingCycle: "monthly",
        billingDay: 1,
        active: true,
        initialFee: 0,
        term: "monthly",
        options: [],
      };
      this.s.plans.push(plan);
    }
    const today = toISODate(new Date());
    const sub: Subscription = {
      id: genId("sub"),
      customerId: input.customerId,
      planId: plan.id,
      status: input.status,
      startedOn: today,
      nextBillingDate: computeNextBillingDate(today, plan.billingDay),
      billingDay: plan.billingDay,
      canceledOn: null,
      optionKeys: [],
      stripeSubscriptionId: input.stripeSubscriptionId,
    };
    this.s.subscriptions.push(sub);
    // 注: 顧客の payment_method は変更しない。
    // (他の口座振替契約の請求方法を壊さないため。Stripe請求は各請求書側で credit_card を明示)
    const c = this.s.customers.find((x) => x.id === input.customerId);
    this.addActivity({
      kind: "subscription_created",
      message: `${c?.name ?? ""} 様のStripe定期課金（${input.planName}）を開始`,
      actor: "Stripe",
    });
    return sub;
  }

  async markStripeSubscriptionCanceled(stripeSubscriptionId: string): Promise<void> {
    const sub = this.s.subscriptions.find(
      (s) => s.stripeSubscriptionId === stripeSubscriptionId,
    );
    if (sub) {
      sub.status = "canceled";
      sub.canceledOn = toISODate(new Date());
    }
  }

  async recordStripeInvoice(input: StripeInvoiceInput): Promise<Invoice | null> {
    const customer = this.s.customers.find(
      (c) => c.stripeCustomerId === input.stripeCustomerId,
    );
    if (!customer) return null;

    // 冪等化: 同一 externalId は再作成しない。ただし「失敗→成功」の遷移は反映する
    const existing = this.s.invoices.find((i) => i.externalId === input.externalId);
    if (existing) {
      if (existing.status === "failed" && input.status === "paid") {
        existing.status = "paid";
        existing.total = input.total;
        existing.subtotal = input.total;
        existing.amountPaid = input.total;
        existing.paidAt = input.paidAt ?? input.issueDate;
        existing.items = input.lines.map((l) => ({
          id: genId("it"),
          description: l.description,
          quantity: 1,
          unitPrice: l.amount,
          taxRate: 0,
          amount: l.amount,
        }));
        this.s.payments.push({
          id: genId("pay"),
          invoiceId: existing.id,
          customerId: customer.id,
          amount: input.total,
          method: "credit_card",
          status: "confirmed",
          paidAt: input.paidAt ?? input.issueDate,
          reference: "Stripe",
          matchedBy: "auto",
          memo: "",
          createdAt: toISODate(new Date()),
        });
        this.addActivity({
          kind: "payment_confirmed",
          message: `${customer.name} 様のStripe決済（再試行）を確認`,
          actor: "Stripe",
          amount: input.total,
          linkInvoiceId: existing.id,
        });
        return existing;
      }
      return null;
    }

    const items: InvoiceItem[] = input.lines.map((l) => ({
      id: genId("it"),
      description: l.description,
      quantity: 1,
      unitPrice: l.amount,
      taxRate: 0,
      amount: l.amount,
    }));
    const paid = input.status === "paid";
    const inv: Invoice = {
      id: genId("inv"),
      invoiceNumber: nextInvoiceNumber(
        this.s.organization.invoicePrefix,
        input.issueDate,
        this.s.invoices.map((i) => i.invoiceNumber),
      ),
      customerId: customer.id,
      subscriptionId:
        this.s.subscriptions.find(
          (s) => s.customerId === customer.id && s.stripeSubscriptionId,
        )?.id ?? null,
      type: input.type,
      status: paid ? "paid" : "failed",
      issueDate: input.issueDate,
      dueDate: input.issueDate,
      billingPeriod: input.billingPeriod ?? null,
      paymentMethod: "credit_card",
      items,
      subtotal: input.total,
      taxTotal: 0,
      total: input.total,
      amountPaid: paid ? input.total : 0,
      notes: "Stripe決済",
      sentAt: input.issueDate,
      paidAt: paid ? input.paidAt ?? input.issueDate : null,
      createdAt: toISODate(new Date()),
      externalId: input.externalId,
    };
    this.s.invoices.push(inv);

    if (paid) {
      this.s.payments.push({
        id: genId("pay"),
        invoiceId: inv.id,
        customerId: customer.id,
        amount: input.total,
        method: "credit_card",
        status: "confirmed",
        paidAt: input.paidAt ?? input.issueDate,
        reference: "Stripe",
        matchedBy: "auto",
        memo: input.type === "initial" ? "初期費用＋初月" : "",
        createdAt: toISODate(new Date()),
      });
    }
    this.addActivity({
      kind: "payment_confirmed",
      message: paid
        ? `${customer.name} 様のStripe決済を確認`
        : `${customer.name} 様のStripe決済が失敗`,
      actor: "Stripe",
      amount: input.total,
      linkInvoiceId: inv.id,
    });
    return inv;
  }

  private addActivity(a: {
    kind: Activity["kind"];
    message: string;
    actor: string;
    amount?: number | null;
    linkInvoiceId?: string | null;
  }) {
    this.s.activities.unshift({
      id: genId("act"),
      kind: a.kind,
      message: a.message,
      actor: a.actor,
      createdAt: new Date().toISOString(),
      amount: a.amount ?? null,
      linkInvoiceId: a.linkInvoiceId ?? null,
    });
  }
}
