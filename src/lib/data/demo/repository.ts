import { effectiveContractStatus } from "@/lib/contracts/build";
import { defaultTemplateInput } from "@/lib/contracts/default-template";
import { computeContractHash } from "@/lib/contracts/hash";
import {
  calcInvoiceTotals,
  computeNextBillingDate,
  effectiveStatus,
  nextInvoiceNumber,
  subscriptionItems,
} from "@/lib/domain/calculations";
import {
  CONTRACT_CODE_MAX_ATTEMPTS,
  computeDevExecution,
  devIssueExecutionLabels,
  devNotificationRecipients,
} from "@/lib/domain/constants";
import { computeDashboardMetrics } from "@/lib/domain/metrics";
import type {
  Activity,
  Agency,
  AgencyMember,
  AppNotification,
  BankTransaction,
  Contract,
  ContractEvent,
  ContractTemplate,
  ContractWithCustomer,
  Customer,
  CustomerStatus,
  DashboardMetrics,
  DevApprovalDecision,
  DevIssue,
  DevIssueAttachment,
  DirectDebitBatch,
  DirectDebitMandate,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceWithCustomer,
  NotificationType,
  Organization,
  Payment,
  Plan,
  Role,
  Subscription,
  UserProfile,
} from "@/lib/domain/types";
import { genId, toISODate } from "@/lib/utils";
import type {
  ActorRef,
  AgencyInput,
  AgencyMemberInput,
  BankRowInput,
  ContractActionResult,
  ContractEventInput,
  ContractFilter,
  ContractInput,
  ContractSendParams,
  ContractSignParams,
  ContractTemplateInput,
  CreateAccountInput,
  CustomerInput,
  DevIssueAttachmentInput,
  DevIssueFilter,
  DevIssueInput,
  DevIssueUpdateInput,
  InvoiceFilter,
  InvoiceInput,
  MandateInput,
  PaymentInput,
  PlanInput,
  Repository,
  StripeInvoiceInput,
  StripeSubscriptionInput,
  SubscriptionInput,
  SubscriptionUpdateInput,
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
      agencyId: input.agencyId ?? null,
      agencyMemberId: input.agencyMemberId ?? null,
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

  async upsertMandate(customerId: string, input: MandateInput): Promise<DirectDebitMandate> {
    const existing = this.s.mandates.find((m) => m.customerId === customerId);
    const registeredAt =
      input.registeredAt !== undefined
        ? input.registeredAt
        : input.status === "active"
          ? toISODate(new Date())
          : (existing?.registeredAt ?? null);
    if (existing) {
      if (input.bankName !== undefined) existing.bankName = input.bankName;
      if (input.branchName !== undefined) existing.branchName = input.branchName;
      if (input.branchCode !== undefined) existing.branchCode = input.branchCode;
      if (input.accountType !== undefined) existing.accountType = input.accountType;
      if (input.accountNumber !== undefined) existing.accountNumber = input.accountNumber;
      if (input.accountHolderKana !== undefined) existing.accountHolderKana = input.accountHolderKana;
      existing.status = input.status;
      existing.registeredAt = registeredAt;
      return existing;
    }
    const mandate: DirectDebitMandate = {
      id: genId("man"),
      customerId,
      bankName: input.bankName ?? "",
      branchName: input.branchName ?? "",
      branchCode: input.branchCode ?? "",
      accountType: input.accountType ?? "普通",
      accountNumber: input.accountNumber ?? "",
      accountHolderKana: input.accountHolderKana ?? "",
      status: input.status,
      registeredAt,
    };
    this.s.mandates.push(mandate);
    return mandate;
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

  async updatePlan(id: string, input: Partial<PlanInput>): Promise<Plan> {
    const p = this.s.plans.find((x) => x.id === id);
    if (!p) throw new Error("プランが見つかりません");
    if (input.name !== undefined) p.name = input.name;
    if (input.description !== undefined) p.description = input.description;
    if (input.amount !== undefined) p.amount = input.amount;
    if (input.taxRate !== undefined) p.taxRate = input.taxRate;
    if (input.billingDay !== undefined) p.billingDay = input.billingDay;
    if (input.active !== undefined) p.active = input.active;
    if (input.initialFee !== undefined) p.initialFee = input.initialFee;
    if (input.term !== undefined) p.term = input.term;
    if (input.options !== undefined) p.options = input.options;
    return p;
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
      priceOverride: input.priceOverride ?? null,
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

  async updateSubscription(id: string, input: SubscriptionUpdateInput): Promise<Subscription> {
    const sub = this.s.subscriptions.find((x) => x.id === id);
    if (!sub) throw new Error("契約が見つかりません");
    if (input.optionKeys !== undefined) sub.optionKeys = input.optionKeys;
    if (input.priceOverride !== undefined) sub.priceOverride = input.priceOverride;
    if (input.billingDay !== undefined) sub.billingDay = input.billingDay;
    return sub;
  }

  // ---- 営業代理店 ----

  async listAgencies(): Promise<Agency[]> {
    return [...this.s.agencies].sort((a, b) => a.code.localeCompare(b.code));
  }

  async getAgency(id: string): Promise<Agency | null> {
    return this.s.agencies.find((a) => a.id === id) ?? null;
  }

  async createAgency(input: AgencyInput): Promise<Agency> {
    const code =
      input.code || `AG-${String(this.s.agencies.length + 1).padStart(3, "0")}`;
    const agency: Agency = {
      id: genId("agc"),
      code,
      name: input.name,
      contactName: input.contactName ?? "",
      email: input.email ?? "",
      phone: input.phone ?? "",
      address: input.address ?? "",
      commissionRate: input.commissionRate,
      notes: input.notes ?? "",
      active: input.active ?? true,
      createdAt: toISODate(new Date()),
    };
    this.s.agencies.push(agency);
    return agency;
  }

  async updateAgency(id: string, input: Partial<AgencyInput>): Promise<Agency> {
    const a = this.s.agencies.find((x) => x.id === id);
    if (!a) throw new Error("代理店が見つかりません");
    if (input.name !== undefined) a.name = input.name;
    if (input.contactName !== undefined) a.contactName = input.contactName;
    if (input.email !== undefined) a.email = input.email;
    if (input.phone !== undefined) a.phone = input.phone;
    if (input.address !== undefined) a.address = input.address;
    if (input.commissionRate !== undefined) a.commissionRate = input.commissionRate;
    if (input.notes !== undefined) a.notes = input.notes;
    if (input.active !== undefined) a.active = input.active;
    return a;
  }

  async listAgencyMembers(agencyId?: string): Promise<AgencyMember[]> {
    let list = [...this.s.agencyMembers];
    if (agencyId) list = list.filter((m) => m.agencyId === agencyId);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createAgencyMember(input: AgencyMemberInput): Promise<AgencyMember> {
    const member: AgencyMember = {
      id: genId("agm"),
      agencyId: input.agencyId,
      name: input.name,
      email: input.email ?? "",
      active: input.active ?? true,
      createdAt: toISODate(new Date()),
    };
    this.s.agencyMembers.push(member);
    return member;
  }

  async updateAgencyMember(
    id: string,
    input: Partial<Omit<AgencyMemberInput, "agencyId">>,
  ): Promise<AgencyMember> {
    const m = this.s.agencyMembers.find((x) => x.id === id);
    if (!m) throw new Error("営業マンが見つかりません");
    if (input.name !== undefined) m.name = input.name;
    if (input.email !== undefined) m.email = input.email;
    if (input.active !== undefined) m.active = input.active;
    return m;
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
        items: subscriptionItems(plan, sub.optionKeys ?? [], period, sub.priceOverride),
        status: customer?.paymentMethod === "direct_debit" ? "awaiting_payment" : "sent",
      });
      created.push(inv);
      sub.nextBillingDate = computeNextBillingDate(sub.nextBillingDate, sub.billingDay);
    }
    return { created };
  }

  // ---- 契約書テンプレート ----

  async listContractTemplates(): Promise<ContractTemplate[]> {
    if (!this.s.contractTemplates.some((t) => t.slug === defaultTemplateInput.slug)) {
      const now = new Date().toISOString();
      this.s.contractTemplates.unshift({
        id: "ctpl_default", // 固定ID(再起動やビルド時プリレンダとのID不一致による404を防ぐ)
        ...defaultTemplateInput,
        version: 1,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return [...this.s.contractTemplates].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }

  async getContractTemplate(id: string): Promise<ContractTemplate | null> {
    await this.listContractTemplates();
    return this.s.contractTemplates.find((t) => t.id === id) ?? null;
  }

  async createContractTemplate(input: ContractTemplateInput): Promise<ContractTemplate> {
    const now = new Date().toISOString();
    const tpl: ContractTemplate = {
      id: genId("ctpl"),
      slug: input.slug ?? genId("tpl"),
      name: input.name,
      description: input.description ?? "",
      docTitle: input.docTitle,
      preamble: input.preamble ?? "",
      sections: input.sections,
      feeTables: input.feeTables,
      providerDefault: input.providerDefault,
      version: 1,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.s.contractTemplates.push(tpl);
    return tpl;
  }

  async updateContractTemplate(
    id: string,
    input: Partial<ContractTemplateInput>,
  ): Promise<ContractTemplate> {
    const tpl = this.s.contractTemplates.find((t) => t.id === id);
    if (!tpl) throw new Error("テンプレートが見つかりません");
    if (input.name !== undefined) tpl.name = input.name;
    if (input.description !== undefined) tpl.description = input.description;
    if (input.docTitle !== undefined) tpl.docTitle = input.docTitle;
    if (input.preamble !== undefined) tpl.preamble = input.preamble;
    if (input.sections !== undefined) tpl.sections = input.sections;
    if (input.feeTables !== undefined) tpl.feeTables = input.feeTables;
    if (input.providerDefault !== undefined) tpl.providerDefault = input.providerDefault;
    if (input.active !== undefined) tpl.active = input.active;
    tpl.version += 1;
    tpl.updatedAt = new Date().toISOString();
    return tpl;
  }

  // ---- 契約書 / 電子契約 ----

  private decorateContract(c: Contract): ContractWithCustomer {
    return {
      ...c,
      status: effectiveContractStatus(c),
      customer: this.s.customers.find((x) => x.id === c.customerId)!,
    };
  }

  private pushContractEvent(contractId: string, e: ContractEventInput): void {
    this.s.contractEvents.push({
      id: genId("cev"),
      contractId,
      type: e.type,
      actor: e.actor,
      ip: e.ip ?? "",
      userAgent: e.userAgent ?? "",
      detail: e.detail ?? "",
      contentHash: e.contentHash ?? "",
      createdAt: new Date().toISOString(),
    });
  }

  async listContracts(filter?: ContractFilter): Promise<ContractWithCustomer[]> {
    let list = this.s.contracts.map((c) => this.decorateContract(c));
    if (filter?.customerId) list = list.filter((c) => c.customerId === filter.customerId);
    if (filter?.status && filter.status !== "all") {
      list = list.filter((c) => c.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.contractNumber.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.customer?.name.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getContract(id: string): Promise<ContractWithCustomer | null> {
    const c = this.s.contracts.find((x) => x.id === id);
    return c ? this.decorateContract(c) : null;
  }

  async getContractByToken(token: string): Promise<ContractWithCustomer | null> {
    if (!token) return null;
    const c = this.s.contracts.find((x) => x.signToken === token);
    return c ? this.decorateContract(c) : null;
  }

  async createContract(input: ContractInput): Promise<Contract> {
    const now = new Date().toISOString();
    const contract: Contract = {
      id: genId("ctr"),
      contractNumber: nextInvoiceNumber(
        "CTR",
        toISODate(new Date()),
        this.s.contracts.map((c) => c.contractNumber),
      ),
      customerId: input.customerId,
      templateId: input.templateId ?? null,
      templateVersion: input.templateVersion ?? null,
      title: input.title,
      preamble: input.preamble ?? "",
      status: "draft",
      provider: input.provider,
      customerParty: input.customerParty,
      sections: input.sections,
      feeTables: input.feeTables,
      terms: input.terms,
      signToken: null,
      accessCode: null,
      accessCodeAttempts: 0,
      expiresAt: null,
      contentHash: null,
      sentAt: null,
      firstViewedAt: null,
      signedAt: null,
      signerName: "",
      signerEmail: "",
      signerIp: "",
      signerUserAgent: "",
      declinedAt: null,
      declineReason: "",
      canceledAt: null,
      cancelReason: "",
      linkedSubscriptionId: null,
      linkedInvoiceId: null,
      createdBy: input.createdBy ?? "",
      createdAt: now,
      updatedAt: now,
    };
    this.s.contracts.push(contract);
    this.pushContractEvent(contract.id, {
      type: "created",
      actor: input.createdBy || "担当者",
      detail: "契約書を作成",
    });
    const cus = this.s.customers.find((c) => c.id === input.customerId);
    this.addActivity({
      kind: "contract_created",
      message: `${cus?.name ?? ""} 様の契約書 ${contract.contractNumber} を作成`,
      actor: input.createdBy || "担当者",
    });
    return contract;
  }

  async updateContractDraft(id: string, input: Partial<ContractInput>): Promise<Contract> {
    const c = this.s.contracts.find((x) => x.id === id);
    if (!c) throw new Error("契約書が見つかりません");
    if (c.status !== "draft") {
      throw new Error("送付済みの契約書は編集できません。取消して新しい契約書を作成してください。");
    }
    if (input.customerId !== undefined) c.customerId = input.customerId;
    if (input.title !== undefined) c.title = input.title;
    if (input.preamble !== undefined) c.preamble = input.preamble;
    if (input.provider !== undefined) c.provider = input.provider;
    if (input.customerParty !== undefined) c.customerParty = input.customerParty;
    if (input.sections !== undefined) c.sections = input.sections;
    if (input.feeTables !== undefined) c.feeTables = input.feeTables;
    if (input.terms !== undefined) c.terms = input.terms;
    c.updatedAt = new Date().toISOString();
    this.pushContractEvent(id, {
      type: "updated",
      actor: input.createdBy || "担当者",
      detail: "下書きを更新",
    });
    return c;
  }

  async markContractSent(id: string, params: ContractSendParams): Promise<Contract> {
    const c = this.s.contracts.find((x) => x.id === id);
    if (!c) throw new Error("契約書が見つかりません");
    if (!["draft", "sent", "viewed"].includes(c.status)) {
      throw new Error("このステータスの契約書は送付できません");
    }
    const isResend = c.status !== "draft";
    if (isResend && c.contentHash && c.contentHash !== params.contentHash) {
      throw new Error("契約内容のハッシュが一致しません(内容が変更されています)");
    }
    c.status = "sent";
    c.signToken = params.token;
    c.accessCode = params.accessCode;
    c.accessCodeAttempts = 0;
    c.expiresAt = params.expiresAt;
    c.contentHash = params.contentHash;
    c.sentAt = new Date().toISOString();
    c.signerEmail = params.signerEmail;
    c.updatedAt = c.sentAt;
    this.pushContractEvent(id, {
      type: "sent",
      actor: params.actor,
      ip: params.ip,
      userAgent: params.userAgent,
      detail: `${isResend ? "再送信(トークン再発行)" : "署名依頼を送付"}: ${params.signerEmail}${params.accessCode ? " / アクセスコードあり" : ""}`,
      contentHash: params.contentHash,
    });
    const cus = this.s.customers.find((x) => x.id === c.customerId);
    this.addActivity({
      kind: "contract_sent",
      message: `${cus?.name ?? ""} 様へ契約書 ${c.contractNumber} の署名依頼を送付`,
      actor: params.actor,
    });
    return c;
  }

  async recordContractViewed(
    token: string,
    meta: { ip: string; userAgent: string },
  ): Promise<void> {
    const c = this.s.contracts.find((x) => x.signToken === token);
    if (!c) return;
    if (c.status !== "sent" && c.status !== "viewed") return;
    const now = new Date().toISOString();
    if (!c.firstViewedAt) c.firstViewedAt = now;
    if (c.status === "sent") c.status = "viewed";
    c.updatedAt = now;
    this.pushContractEvent(c.id, {
      type: "viewed",
      actor: c.customerParty.representative || "契約者",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async verifyContractAccessCode(
    token: string,
    code: string,
    meta: { ip: string; userAgent: string },
  ): Promise<{ ok: boolean; locked?: boolean; error?: string }> {
    const c = this.s.contracts.find((x) => x.signToken === token);
    if (!c) return { ok: false, error: "契約書が見つかりません" };
    if (!c.accessCode) return { ok: true };
    if (c.accessCodeAttempts >= CONTRACT_CODE_MAX_ATTEMPTS) {
      return { ok: false, locked: true, error: "試行回数の上限に達しました。送信元にお問い合わせください。" };
    }
    if (code === c.accessCode) {
      this.pushContractEvent(c.id, {
        type: "code_verified",
        actor: c.customerParty.representative || "契約者",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await this.recordContractViewed(token, meta);
      return { ok: true };
    }
    c.accessCodeAttempts += 1;
    this.pushContractEvent(c.id, {
      type: "code_failed",
      actor: "契約者",
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail: `失敗 ${c.accessCodeAttempts} 回目`,
    });
    const locked = c.accessCodeAttempts >= CONTRACT_CODE_MAX_ATTEMPTS;
    return {
      ok: false,
      locked,
      error: locked
        ? "試行回数の上限に達しました。送信元にお問い合わせください。"
        : "アクセスコードが一致しません",
    };
  }

  async signContract(token: string, params: ContractSignParams): Promise<ContractActionResult> {
    const c = this.s.contracts.find((x) => x.signToken === token);
    if (!c) return { ok: false, error: "契約書が見つかりません" };
    if (c.status !== "sent" && c.status !== "viewed") {
      return { ok: false, error: "この契約書は署名できる状態ではありません" };
    }
    if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) {
      return { ok: false, error: "署名期限が切れています。送信元に再送を依頼してください。" };
    }
    if (c.accessCode) {
      if (c.accessCodeAttempts >= CONTRACT_CODE_MAX_ATTEMPTS) {
        return { ok: false, locked: true, error: "試行回数の上限に達しました" };
      }
      if (params.accessCode !== c.accessCode) {
        // 署名アクション経由の総当たりも試行回数に数え、証跡に残す
        c.accessCodeAttempts += 1;
        this.pushContractEvent(c.id, {
          type: "code_failed",
          actor: "契約者",
          ip: params.ip,
          userAgent: params.userAgent,
          detail: `署名時のコード不一致 (失敗 ${c.accessCodeAttempts} 回目)`,
        });
        return { ok: false, error: "アクセスコードが一致しません" };
      }
    }
    // 改ざん検知: 送付時に固定化したハッシュと現在の内容を照合
    const recomputed = computeContractHash(c);
    if (!c.contentHash || recomputed !== c.contentHash) {
      return {
        ok: false,
        error: "契約内容の整合性エラーが検出されました。送信元にお問い合わせください。",
      };
    }
    const now = new Date().toISOString();
    c.status = "signed";
    c.signedAt = now;
    c.signerName = params.signerName;
    c.signerIp = params.ip;
    c.signerUserAgent = params.userAgent;
    c.updatedAt = now;
    this.pushContractEvent(c.id, {
      type: "signed",
      actor: params.signerName,
      ip: params.ip,
      userAgent: params.userAgent,
      detail: "電子署名(同意)。内容ハッシュ照合 OK",
      contentHash: c.contentHash,
    });
    const cus = this.s.customers.find((x) => x.id === c.customerId);
    this.addActivity({
      kind: "contract_signed",
      message: `${cus?.name ?? ""} 様が契約書 ${c.contractNumber} に電子署名`,
      actor: params.signerName,
    });
    return { ok: true, contract: c };
  }

  async declineContract(
    token: string,
    params: { reason: string; accessCode?: string; ip: string; userAgent: string },
  ): Promise<ContractActionResult> {
    const c = this.s.contracts.find((x) => x.signToken === token);
    if (!c) return { ok: false, error: "契約書が見つかりません" };
    if (c.status !== "sent" && c.status !== "viewed") {
      return { ok: false, error: "この契約書は辞退できる状態ではありません" };
    }
    if (c.accessCode) {
      if (c.accessCodeAttempts >= CONTRACT_CODE_MAX_ATTEMPTS) {
        return { ok: false, locked: true, error: "試行回数の上限に達しました" };
      }
      if (params.accessCode !== c.accessCode) {
        c.accessCodeAttempts += 1;
        this.pushContractEvent(c.id, {
          type: "code_failed",
          actor: "契約者",
          ip: params.ip,
          userAgent: params.userAgent,
          detail: `辞退時のコード不一致 (失敗 ${c.accessCodeAttempts} 回目)`,
        });
        return { ok: false, error: "アクセスコードが一致しません" };
      }
    }
    const now = new Date().toISOString();
    c.status = "declined";
    c.declinedAt = now;
    c.declineReason = params.reason;
    c.updatedAt = now;
    this.pushContractEvent(c.id, {
      type: "declined",
      actor: c.customerParty.representative || "契約者",
      ip: params.ip,
      userAgent: params.userAgent,
      detail: params.reason,
    });
    return { ok: true, contract: c };
  }

  async cancelContract(id: string, reason: string, actor: string): Promise<Contract> {
    const c = this.s.contracts.find((x) => x.id === id);
    if (!c) throw new Error("契約書が見つかりません");
    if (!["draft", "sent", "viewed"].includes(c.status)) {
      throw new Error("締結済み・終了済みの契約書は取消できません");
    }
    const now = new Date().toISOString();
    c.status = "canceled";
    c.canceledAt = now;
    c.cancelReason = reason;
    c.signToken = null; // 署名リンクを無効化
    c.updatedAt = now;
    this.pushContractEvent(id, { type: "canceled", actor, detail: reason });
    return c;
  }

  async markContractSignedManually(
    id: string,
    params: { signerName: string; signedAt: string; note: string; actor: string },
  ): Promise<Contract> {
    const c = this.s.contracts.find((x) => x.id === id);
    if (!c) throw new Error("契約書が見つかりません");
    if (!["draft", "sent", "viewed"].includes(c.status)) {
      throw new Error("このステータスの契約書は締結登録できません");
    }
    const now = new Date().toISOString();
    if (!c.contentHash) c.contentHash = computeContractHash(c);
    c.status = "signed";
    c.signedAt = params.signedAt;
    c.signerName = params.signerName;
    c.signToken = null; // 未使用の署名リンクを無効化
    c.updatedAt = now;
    this.pushContractEvent(id, {
      type: "manual_signed",
      actor: params.actor,
      detail: `書面締結を登録: 署名者 ${params.signerName}${params.note ? ` / ${params.note}` : ""}`,
      contentHash: c.contentHash,
    });
    return c;
  }

  async linkContractBilling(
    id: string,
    params: {
      subscriptionId?: string | null;
      invoiceId?: string | null;
      actor: string;
      detail?: string;
      guardUnlinked?: boolean;
    },
  ): Promise<Contract | null> {
    const c = this.s.contracts.find((x) => x.id === id);
    if (!c) throw new Error("契約書が見つかりません");
    if (params.guardUnlinked && (c.linkedSubscriptionId || c.linkedInvoiceId)) {
      return null; // 並行実行で先に紐付け済み
    }
    if (params.subscriptionId !== undefined) c.linkedSubscriptionId = params.subscriptionId;
    if (params.invoiceId !== undefined) c.linkedInvoiceId = params.invoiceId;
    c.updatedAt = new Date().toISOString();
    this.pushContractEvent(id, {
      type: "billing_linked",
      actor: params.actor,
      detail: params.detail ?? "請求連携を開始",
    });
    return c;
  }

  async listContractEvents(contractId: string): Promise<ContractEvent[]> {
    return this.s.contractEvents
      .filter((e) => e.contractId === contractId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addContractEvent(contractId: string, event: ContractEventInput): Promise<void> {
    this.pushContractEvent(contractId, event);
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

  // --- 開発依頼 / 進捗管理 ---

  async listDevIssues(filter?: DevIssueFilter): Promise<DevIssue[]> {
    let list = [...this.s.devIssues];
    if (filter?.status && filter.status !== "all") {
      list = list.filter((i) => i.status === filter.status);
    }
    if (filter?.category && filter.category !== "all") {
      list = list.filter((i) => i.category === filter.category);
    }
    if (filter?.priority && filter.priority !== "all") {
      list = list.filter((i) => i.priority === filter.priority);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.detail.toLowerCase().includes(q) ||
          i.devNote.toLowerCase().includes(q) ||
          i.requesterName.toLowerCase().includes(q) ||
          `#${i.issueNumber}` === q,
      );
    }
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getDevIssue(id: string): Promise<DevIssue | null> {
    return this.s.devIssues.find((i) => i.id === id) ?? null;
  }

  async createDevIssue(input: DevIssueInput): Promise<DevIssue> {
    const now = new Date().toISOString();
    const issue: DevIssue = {
      id: genId("dvi"),
      issueNumber: ++this.s.devIssueSeq,
      title: input.title,
      detail: input.detail ?? "",
      category: input.category,
      priority: input.priority ?? "medium",
      status: "open",
      execution: "undecided",
      requesterId: input.requester.id,
      requesterName: input.requester.name,
      scheduledDate: null,
      completedDate: null,
      devNote: "",
      approvals: [],
      createdAt: now,
      updatedAt: now,
    };
    this.s.devIssues.unshift(issue);
    this.notifyDevIssue(
      "issue_created",
      issue,
      `${input.requester.name} さんが #${issue.issueNumber}「${issue.title}」を登録しました`,
      input.requester.id,
    );
    return issue;
  }

  async updateDevIssue(
    id: string,
    input: DevIssueUpdateInput,
    actor: ActorRef,
  ): Promise<DevIssue> {
    const issue = this.s.devIssues.find((i) => i.id === id);
    if (!issue) throw new Error("開発依頼が見つかりません");
    const prevStatus = issue.status;
    if (input.title !== undefined) issue.title = input.title;
    if (input.detail !== undefined) issue.detail = input.detail;
    if (input.category !== undefined) issue.category = input.category;
    if (input.priority !== undefined) issue.priority = input.priority;
    if (input.status !== undefined) issue.status = input.status;
    if (input.scheduledDate !== undefined) issue.scheduledDate = input.scheduledDate;
    if (input.completedDate !== undefined) issue.completedDate = input.completedDate;
    if (input.devNote !== undefined) issue.devNote = input.devNote;
    // 対応完了にした場合、完了日が未入力なら当日を補完する
    if (issue.status === "done" && !issue.completedDate) {
      issue.completedDate = toISODate(new Date());
    }
    issue.updatedAt = new Date().toISOString();
    if (issue.status !== prevStatus) {
      if (issue.status === "done") {
        this.notifyDevIssue(
          "issue_done",
          issue,
          `#${issue.issueNumber}「${issue.title}」が対応完了になりました（${actor.name}）`,
          actor.id,
        );
      } else if (issue.status === "hearing") {
        this.notifyDevIssue(
          "issue_hearing",
          issue,
          `#${issue.issueNumber}「${issue.title}」に追加ヒアリングがあります（${actor.name}）`,
          actor.id,
        );
      }
    }
    return issue;
  }

  async setDevIssueApproval(
    issueId: string,
    approver: ActorRef,
    decision: DevApprovalDecision | null,
  ): Promise<DevIssue> {
    const issue = this.s.devIssues.find((i) => i.id === issueId);
    if (!issue) throw new Error("開発依頼が見つかりません");
    issue.approvals = issue.approvals.filter((a) => a.approverId !== approver.id);
    if (decision) {
      issue.approvals.push({
        id: genId("apv"),
        issueId: issue.id,
        approverId: approver.id,
        approverName: approver.name,
        decision,
        createdAt: new Date().toISOString(),
      });
    }
    const prev = issue.execution;
    issue.execution = computeDevExecution(issue.approvals.map((a) => a.decision));
    issue.updatedAt = new Date().toISOString();
    if (issue.execution !== prev && issue.execution !== "undecided") {
      this.notifyDevIssue(
        "issue_execution",
        issue,
        `#${issue.issueNumber}「${issue.title}」の実行有無が「${devIssueExecutionLabels[issue.execution]}」になりました`,
        approver.id,
      );
    }
    return issue;
  }

  // --- 開発依頼の添付画像 ---

  async listDevIssueAttachments(issueId: string): Promise<DevIssueAttachment[]> {
    return this.s.devIssueAttachments
      .filter((a) => a.issueId === issueId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addDevIssueAttachment(
    issueId: string,
    input: DevIssueAttachmentInput,
  ): Promise<DevIssueAttachment> {
    const issue = this.s.devIssues.find((i) => i.id === issueId);
    if (!issue) throw new Error("開発依頼が見つかりません");
    const attachment: DevIssueAttachment = {
      id: genId("att"),
      issueId,
      fileName: input.fileName,
      contentType: input.contentType,
      url: input.dataUrl,
      kind: input.kind,
      uploadedById: input.uploadedBy.id,
      uploadedByName: input.uploadedBy.name,
      createdAt: new Date().toISOString(),
    };
    this.s.devIssueAttachments.push(attachment);
    return attachment;
  }

  async getDevIssueAttachment(id: string): Promise<DevIssueAttachment | null> {
    return this.s.devIssueAttachments.find((a) => a.id === id) ?? null;
  }

  async deleteDevIssueAttachment(id: string): Promise<void> {
    const idx = this.s.devIssueAttachments.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("添付画像が見つかりません");
    this.s.devIssueAttachments.splice(idx, 1);
  }

  // --- アプリ内通知 ---

  async listNotifications(
    userId: string,
    opts?: { unreadOnly?: boolean; limit?: number },
  ): Promise<AppNotification[]> {
    let list = this.s.notifications.filter((n) => n.userId === userId);
    if (opts?.unreadOnly) list = list.filter((n) => !n.read);
    list = list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list.slice(0, opts?.limit ?? 50);
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    return this.s.notifications.filter((n) => n.userId === userId && !n.read).length;
  }

  async markNotificationsRead(userId: string, ids?: string[]): Promise<void> {
    for (const n of this.s.notifications) {
      if (n.userId !== userId) continue;
      if (ids && !ids.includes(n.id)) continue;
      n.read = true;
    }
  }

  // --- アカウント(プロフィール) ---

  async listUserProfiles(): Promise<UserProfile[]> {
    return [...this.s.profiles];
  }

  async updateUserRole(userId: string, role: Role): Promise<void> {
    const p = this.s.profiles.find((x) => x.id === userId);
    if (!p) throw new Error("アカウントが見つかりません");
    p.role = role;
  }

  async createUserAccount(input: CreateAccountInput): Promise<UserProfile> {
    if (this.s.profiles.some((p) => p.email === input.email)) {
      throw new Error("同じメールアドレスのアカウントが既に存在します");
    }
    const profile: UserProfile = {
      id: genId("usr"),
      name: input.name,
      email: input.email,
      role: input.role,
      createdAt: new Date().toISOString(),
    };
    this.s.profiles.push(profile);
    return profile;
  }

  async updateUserName(userId: string, name: string): Promise<void> {
    const p = this.s.profiles.find((x) => x.id === userId);
    if (!p) throw new Error("アカウントが見つかりません");
    p.name = name;
  }

  async updateAccountPassword(userId: string): Promise<void> {
    // デモモードは認証がないため何もしない(操作フローの確認用)
    const p = this.s.profiles.find((x) => x.id === userId);
    if (!p) throw new Error("アカウントが見つかりません");
  }

  async deleteUserAccount(userId: string): Promise<void> {
    const idx = this.s.profiles.findIndex((x) => x.id === userId);
    if (idx < 0) throw new Error("アカウントが見つかりません");
    this.s.profiles.splice(idx, 1);
    // 本人宛の通知も削除(開発依頼の履歴は依頼者名を保持したまま残る)
    this.s.notifications = this.s.notifications.filter((n) => n.userId !== userId);
  }

  /** 開発依頼イベントの通知を該当ユーザーへ配信(操作者本人は除外) */
  private notifyDevIssue(
    type: NotificationType,
    issue: DevIssue,
    message: string,
    actorId: string,
  ) {
    const recipients = devNotificationRecipients({
      type,
      profiles: this.s.profiles,
      requesterId: issue.requesterId,
      actorId,
    });
    const now = new Date().toISOString();
    for (const userId of recipients) {
      this.s.notifications.unshift({
        id: genId("ntf"),
        userId,
        type,
        message,
        issueId: issue.id,
        read: false,
        createdAt: now,
      });
    }
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
