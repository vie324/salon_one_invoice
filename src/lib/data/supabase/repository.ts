import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcInvoiceTotals,
  computeNextBillingDate,
  effectiveStatus,
  nextInvoiceNumber,
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

/* eslint-disable @typescript-eslint/no-explicit-any */

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

// ---- row -> domain mappers ----

function mapOrg(r: any): Organization {
  return {
    id: r.id,
    name: r.name,
    postalCode: r.postal_code ?? "",
    address: r.address ?? "",
    tel: r.tel ?? "",
    email: r.email ?? "",
    registrationNumber: r.registration_number ?? "",
    bankName: r.bank_name ?? "",
    bankBranch: r.bank_branch ?? "",
    bankAccountType: r.bank_account_type ?? "普通",
    bankAccountNumber: r.bank_account_number ?? "",
    bankAccountHolder: r.bank_account_holder ?? "",
    invoicePrefix: r.invoice_prefix ?? "INV",
    defaultTaxRate: Number(r.default_tax_rate ?? 0.1),
    logoText: r.logo_text ?? "S1",
  };
}

function mapCustomer(r: any): Customer {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    kana: r.kana ?? "",
    contactName: r.contact_name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    postalCode: r.postal_code ?? "",
    address: r.address ?? "",
    paymentMethod: r.payment_method,
    status: r.status,
    assignee: r.assignee ?? "",
    notes: r.notes ?? "",
    createdAt: r.created_at,
    stripeCustomerId: r.stripe_customer_id ?? null,
  };
}

function mapMandate(r: any): DirectDebitMandate {
  return {
    id: r.id,
    customerId: r.customer_id,
    bankName: r.bank_name ?? "",
    branchName: r.branch_name ?? "",
    branchCode: r.branch_code ?? "",
    accountType: r.account_type ?? "普通",
    accountNumber: r.account_number ?? "",
    accountHolderKana: r.account_holder_kana ?? "",
    status: r.status,
    registeredAt: r.registered_at,
  };
}

function mapPlan(r: any): Plan {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    amount: Number(r.amount),
    taxRate: Number(r.tax_rate),
    billingCycle: "monthly",
    billingDay: r.billing_day,
    active: r.active,
  };
}

function mapSubscription(r: any): Subscription {
  return {
    id: r.id,
    customerId: r.customer_id,
    planId: r.plan_id,
    status: r.status,
    startedOn: r.started_on,
    nextBillingDate: r.next_billing_date,
    billingDay: r.billing_day,
    canceledOn: r.canceled_on,
    stripeSubscriptionId: r.stripe_subscription_id ?? null,
  };
}

function mapItem(r: any): InvoiceItem {
  return {
    id: r.id,
    description: r.description,
    quantity: Number(r.quantity),
    unitPrice: Number(r.unit_price),
    taxRate: Number(r.tax_rate),
    amount: Number(r.amount),
  };
}

function mapInvoice(r: any): Invoice {
  const items = (r.invoice_items ?? [])
    .slice()
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    .map(mapItem);
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    customerId: r.customer_id,
    subscriptionId: r.subscription_id,
    type: r.type,
    status: r.status,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    billingPeriod: r.billing_period,
    paymentMethod: r.payment_method,
    items,
    subtotal: Number(r.subtotal),
    taxTotal: Number(r.tax_total),
    total: Number(r.total),
    amountPaid: Number(r.amount_paid ?? 0),
    notes: r.notes ?? "",
    sentAt: r.sent_at,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    externalId: r.external_id ?? null,
  };
}

function mapPayment(r: any): Payment {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    customerId: r.customer_id,
    amount: Number(r.amount),
    method: r.method,
    status: r.status,
    paidAt: r.paid_at,
    reference: r.reference ?? "",
    matchedBy: r.matched_by ?? "manual",
    memo: r.memo ?? "",
    createdAt: r.created_at,
  };
}

function mapBatch(r: any): DirectDebitBatch {
  return {
    id: r.id,
    name: r.name,
    scheduledDate: r.scheduled_date,
    status: r.status,
    createdAt: r.created_at,
    items: (r.direct_debit_batch_items ?? []).map((it: any) => ({
      id: it.id,
      batchId: it.batch_id,
      invoiceId: it.invoice_id,
      customerId: it.customer_id,
      mandateId: it.mandate_id,
      amount: Number(it.amount),
      result: it.result,
      resultReason: it.result_reason ?? "",
    })),
  };
}

function mapBankTxn(r: any): BankTransaction {
  return {
    id: r.id,
    transactionDate: r.transaction_date,
    amount: Number(r.amount),
    payerName: r.payer_name ?? "",
    description: r.description ?? "",
    matchedInvoiceId: r.matched_invoice_id,
    matchedPaymentId: r.matched_payment_id,
    importedAt: r.imported_at,
  };
}

function mapActivity(r: any): Activity {
  return {
    id: r.id,
    kind: r.kind,
    message: r.message,
    actor: r.actor ?? "",
    createdAt: r.created_at,
    amount: r.amount == null ? null : Number(r.amount),
    linkInvoiceId: r.link_invoice_id,
  };
}

const INVOICE_SELECT = "*, invoice_items(*)";

/** Supabase(Postgres) 実装。RLS 適用のクライアントを受け取る。 */
export class SupabaseRepository implements Repository {
  constructor(private db: SupabaseClient) {}

  private async logActivity(a: Omit<Activity, "id" | "createdAt">) {
    await this.db.from("activities").insert({
      kind: a.kind,
      message: a.message,
      actor: a.actor,
      amount: a.amount,
      link_invoice_id: a.linkInvoiceId,
    });
  }

  async getOrganization(): Promise<Organization> {
    const { data, error } = await this.db.from("organizations").select("*").limit(1).single();
    if (error) throw error;
    return mapOrg(data);
  }

  async listCustomers(filter?: { status?: CustomerStatus; search?: string }): Promise<Customer[]> {
    let q = this.db.from("customers").select("*").order("code");
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.search) {
      const s = `%${filter.search}%`;
      q = q.or(`name.ilike.${s},kana.ilike.${s},code.ilike.${s},email.ilike.${s}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapCustomer);
  }

  async getCustomer(id: string): Promise<Customer | null> {
    const { data } = await this.db.from("customers").select("*").eq("id", id).maybeSingle();
    return data ? mapCustomer(data) : null;
  }

  async createCustomer(input: CustomerInput): Promise<Customer> {
    let code = input.code;
    if (!code) {
      const { count } = await this.db
        .from("customers")
        .select("*", { count: "exact", head: true });
      code = `M-${String((count ?? 0) + 1).padStart(4, "0")}`;
    }
    const { data, error } = await this.db
      .from("customers")
      .insert({
        code,
        name: input.name,
        kana: input.kana ?? "",
        contact_name: input.contactName ?? input.name,
        email: input.email ?? "",
        phone: input.phone ?? "",
        postal_code: input.postalCode ?? "",
        address: input.address ?? "",
        payment_method: input.paymentMethod,
        status: input.status ?? "active",
        assignee: input.assignee ?? "",
        notes: input.notes ?? "",
      })
      .select("*")
      .single();
    if (error) throw error;
    await this.logActivity({
      kind: "customer_created",
      message: `新規顧客 ${input.name} 様を登録`,
      actor: input.assignee || "担当者",
      amount: null,
      linkInvoiceId: null,
    });
    return mapCustomer(data);
  }

  async updateCustomer(id: string, input: Partial<CustomerInput>): Promise<Customer> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.kana !== undefined) patch.kana = input.kana;
    if (input.contactName !== undefined) patch.contact_name = input.contactName;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.postalCode !== undefined) patch.postal_code = input.postalCode;
    if (input.address !== undefined) patch.address = input.address;
    if (input.paymentMethod !== undefined) patch.payment_method = input.paymentMethod;
    if (input.status !== undefined) patch.status = input.status;
    if (input.assignee !== undefined) patch.assignee = input.assignee;
    if (input.notes !== undefined) patch.notes = input.notes;
    const { data, error } = await this.db
      .from("customers")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapCustomer(data);
  }

  async getMandateByCustomer(customerId: string): Promise<DirectDebitMandate | null> {
    const { data } = await this.db
      .from("direct_debit_mandates")
      .select("*")
      .eq("customer_id", customerId)
      .maybeSingle();
    return data ? mapMandate(data) : null;
  }

  async listPlans(): Promise<Plan[]> {
    const { data, error } = await this.db.from("plans").select("*").order("amount");
    if (error) throw error;
    return (data ?? []).map(mapPlan);
  }

  async getPlan(id: string): Promise<Plan | null> {
    const { data } = await this.db.from("plans").select("*").eq("id", id).maybeSingle();
    return data ? mapPlan(data) : null;
  }

  async createPlan(input: PlanInput): Promise<Plan> {
    const { data, error } = await this.db
      .from("plans")
      .insert({
        name: input.name,
        description: input.description ?? "",
        amount: input.amount,
        tax_rate: input.taxRate,
        billing_cycle: "monthly",
        billing_day: input.billingDay,
        active: input.active ?? true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapPlan(data);
  }

  async listSubscriptions(): Promise<Subscription[]> {
    const { data, error } = await this.db.from("subscriptions").select("*");
    if (error) throw error;
    return (data ?? []).map(mapSubscription);
  }

  async createSubscription(input: SubscriptionInput): Promise<Subscription> {
    const plan = await this.getPlan(input.planId);
    const billingDay = input.billingDay ?? plan?.billingDay ?? 27;
    const { data, error } = await this.db
      .from("subscriptions")
      .insert({
        customer_id: input.customerId,
        plan_id: input.planId,
        status: "active",
        started_on: input.startedOn,
        next_billing_date: computeNextBillingDate(input.startedOn, billingDay),
        billing_day: billingDay,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapSubscription(data);
  }

  async updateSubscriptionStatus(
    id: string,
    status: Subscription["status"],
  ): Promise<Subscription> {
    const patch: Record<string, unknown> = { status };
    if (status === "canceled") patch.canceled_on = toISODate(new Date());
    const { data, error } = await this.db
      .from("subscriptions")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapSubscription(data);
  }

  async listInvoices(filter?: InvoiceFilter): Promise<InvoiceWithCustomer[]> {
    let q = this.db
      .from("invoices")
      .select(`${INVOICE_SELECT}, customer:customers(*)`)
      .order("issue_date", { ascending: false });
    if (filter?.customerId) q = q.eq("customer_id", filter.customerId);
    if (filter?.type && filter.type !== "all") q = q.eq("type", filter.type);
    if (filter?.paymentMethod && filter.paymentMethod !== "all") {
      q = q.eq("payment_method", filter.paymentMethod);
    }
    const { data, error } = await q;
    if (error) throw error;
    let list = (data ?? []).map((r: any) => {
      const inv = mapInvoice(r);
      return {
        ...inv,
        status: effectiveStatus(inv),
        customer: mapCustomer(r.customer),
      } as InvoiceWithCustomer;
    });
    if (filter?.status && filter.status !== "all") {
      list = list.filter((i) => i.status === filter.status);
    }
    if (filter?.search) {
      const s = filter.search.toLowerCase();
      list = list.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(s) ||
          i.customer?.name.toLowerCase().includes(s),
      );
    }
    return list;
  }

  async getInvoice(id: string): Promise<InvoiceWithCustomer | null> {
    const { data } = await this.db
      .from("invoices")
      .select(`${INVOICE_SELECT}, customer:customers(*)`)
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const inv = mapInvoice(data);
    return {
      ...inv,
      status: effectiveStatus(inv),
      customer: mapCustomer((data as any).customer),
    };
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
    const org = await this.getOrganization();
    const { data: existing } = await this.db.from("invoices").select("invoice_number");
    const number = nextInvoiceNumber(
      org.invoicePrefix,
      input.issueDate,
      (existing ?? []).map((r: any) => r.invoice_number),
    );
    const status: InvoiceStatus = input.status ?? "draft";
    const { data: invRow, error } = await this.db
      .from("invoices")
      .insert({
        invoice_number: number,
        customer_id: input.customerId,
        subscription_id: input.subscriptionId ?? null,
        type: input.type,
        status,
        issue_date: input.issueDate,
        due_date: input.dueDate,
        billing_period: input.billingPeriod ?? null,
        payment_method: input.paymentMethod,
        subtotal: totals.subtotal,
        tax_total: totals.taxTotal,
        total: totals.total,
        amount_paid: 0,
        notes: input.notes ?? "",
        sent_at: status !== "draft" ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    const { error: itemsError } = await this.db.from("invoice_items").insert(
      items.map((it, idx) => ({
        invoice_id: invRow.id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        tax_rate: it.taxRate,
        amount: it.amount,
        position: idx,
      })),
    );
    if (itemsError) throw itemsError;
    await this.logActivity({
      kind: status === "draft" ? "invoice_created" : "invoice_sent",
      message:
        status === "draft"
          ? `請求書 ${number} を作成`
          : `請求書 ${number} を送付`,
      actor: "担当者",
      amount: totals.total,
      linkInvoiceId: invRow.id,
    });
    return { ...mapInvoice(invRow), items };
  }

  async updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    const patch: Record<string, unknown> = { status };
    if (status === "paid") {
      const inv = await this.getInvoice(id);
      if (inv) {
        patch.amount_paid = inv.total;
        patch.paid_at = new Date().toISOString();
      }
    }
    const { data, error } = await this.db
      .from("invoices")
      .update(patch)
      .eq("id", id)
      .select(INVOICE_SELECT)
      .single();
    if (error) throw error;
    return mapInvoice(data);
  }

  async sendInvoice(id: string): Promise<Invoice> {
    const current = await this.getInvoice(id);
    if (!current) throw new Error("請求書が見つかりません");
    const patch: Record<string, unknown> = { sent_at: new Date().toISOString() };
    if (current.status === "draft") {
      patch.status = current.paymentMethod === "direct_debit" ? "awaiting_payment" : "sent";
    }
    const { data, error } = await this.db
      .from("invoices")
      .update(patch)
      .eq("id", id)
      .select(INVOICE_SELECT)
      .single();
    if (error) throw error;
    await this.logActivity({
      kind: "invoice_sent",
      message: `請求書 ${current.invoiceNumber} を送付`,
      actor: "担当者",
      amount: current.total,
      linkInvoiceId: id,
    });
    return mapInvoice(data);
  }

  async listPayments(filter?: { customerId?: string }): Promise<Payment[]> {
    let q = this.db.from("payments").select("*").order("paid_at", { ascending: false });
    if (filter?.customerId) q = q.eq("customer_id", filter.customerId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapPayment);
  }

  async recordPayment(input: PaymentInput): Promise<Payment> {
    const { data, error } = await this.db
      .from("payments")
      .insert({
        invoice_id: input.invoiceId ?? null,
        customer_id: input.customerId,
        amount: input.amount,
        method: input.method,
        status: "confirmed",
        paid_at: input.paidAt,
        reference: input.reference ?? "",
        matched_by: input.matchedBy ?? "manual",
        memo: input.memo ?? "",
      })
      .select("*")
      .single();
    if (error) throw error;
    if (input.invoiceId) {
      const inv = await this.getInvoice(input.invoiceId);
      if (inv) {
        const paid = inv.amountPaid + input.amount;
        const patch: Record<string, unknown> = { amount_paid: paid };
        if (paid >= inv.total) {
          patch.status = "paid";
          patch.paid_at = input.paidAt;
        } else if (paid > 0) {
          patch.status = "partially_paid";
        }
        await this.db.from("invoices").update(patch).eq("id", input.invoiceId);
      }
    }
    await this.logActivity({
      kind: "payment_confirmed",
      message: `入金を確認（${input.reference || ""}）`,
      actor: "担当者",
      amount: input.amount,
      linkInvoiceId: input.invoiceId ?? null,
    });
    return mapPayment(data);
  }

  async listBatches(): Promise<DirectDebitBatch[]> {
    const { data, error } = await this.db
      .from("direct_debit_batches")
      .select("*, direct_debit_batch_items(*)")
      .order("scheduled_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapBatch);
  }

  async getBatch(id: string): Promise<DirectDebitBatch | null> {
    const { data } = await this.db
      .from("direct_debit_batches")
      .select("*, direct_debit_batch_items(*)")
      .eq("id", id)
      .maybeSingle();
    return data ? mapBatch(data) : null;
  }

  async createBatchFromAwaiting(scheduledDate: string): Promise<DirectDebitBatch> {
    // 既にバッチ済みの請求書IDを除外
    const { data: existingItems } = await this.db
      .from("direct_debit_batch_items")
      .select("invoice_id");
    const batched = new Set((existingItems ?? []).map((r: any) => r.invoice_id));
    const { data: invoices } = await this.db
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("payment_method", "direct_debit")
      .in("status", ["awaiting_payment", "sent"]);
    const targets = (invoices ?? [])
      .map(mapInvoice)
      .filter((inv) => inv.amountPaid < inv.total && !batched.has(inv.id));

    const { data: batchRow, error } = await this.db
      .from("direct_debit_batches")
      .insert({
        name: `${ym(new Date(scheduledDate))} 口座振替`,
        scheduled_date: scheduledDate,
        status: "draft",
      })
      .select("*")
      .single();
    if (error) throw error;

    if (targets.length > 0) {
      const mandates = await Promise.all(
        targets.map((inv) => this.getMandateByCustomer(inv.customerId)),
      );
      await this.db.from("direct_debit_batch_items").insert(
        targets.map((inv, i) => ({
          batch_id: batchRow.id,
          invoice_id: inv.id,
          customer_id: inv.customerId,
          mandate_id: mandates[i]?.id ?? null,
          amount: inv.total,
          result: "pending",
          result_reason: "",
        })),
      );
    }
    return (await this.getBatch(batchRow.id))!;
  }

  async processBatch(id: string): Promise<DirectDebitBatch> {
    const batch = await this.getBatch(id);
    if (!batch) throw new Error("バッチが見つかりません");
    let success = 0;
    let failed = 0;
    for (const item of batch.items) {
      if (item.result !== "pending") continue;
      const mandate = item.mandateId
        ? (await this.db
            .from("direct_debit_mandates")
            .select("*")
            .eq("id", item.mandateId)
            .maybeSingle()).data
        : null;
      const ok = mandate?.status === "active";
      if (ok) {
        await this.db
          .from("direct_debit_batch_items")
          .update({ result: "success" })
          .eq("id", item.id);
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
        await this.db
          .from("direct_debit_batch_items")
          .update({
            result: "failed",
            result_reason: mandate ? "口座振替の登録が有効ではありません" : "残高不足",
          })
          .eq("id", item.id);
        await this.db.from("invoices").update({ status: "failed" }).eq("id", item.invoiceId);
        failed++;
      }
    }
    await this.db.from("direct_debit_batches").update({ status: "completed" }).eq("id", id);
    await this.logActivity({
      kind: "batch_processed",
      message: `${batch.name} を処理（成功 ${success}件 / 失敗 ${failed}件）`,
      actor: "システム",
      amount: null,
      linkInvoiceId: null,
    });
    return (await this.getBatch(id))!;
  }

  async listBankTransactions(): Promise<BankTransaction[]> {
    const { data, error } = await this.db
      .from("bank_transactions")
      .select("*")
      .order("transaction_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapBankTxn);
  }

  async importBankTransactions(rows: BankRowInput[]): Promise<BankTransaction[]> {
    const { data, error } = await this.db
      .from("bank_transactions")
      .insert(
        rows.map((r) => ({
          transaction_date: r.transactionDate,
          amount: r.amount,
          payer_name: r.payerName,
          description: r.description,
        })),
      )
      .select("*");
    if (error) throw error;
    return (data ?? []).map(mapBankTxn);
  }

  async matchBankTransaction(txnId: string, invoiceId: string): Promise<void> {
    const { data: txn } = await this.db
      .from("bank_transactions")
      .select("*")
      .eq("id", txnId)
      .maybeSingle();
    const inv = await this.getInvoice(invoiceId);
    if (!txn || !inv) throw new Error("対象が見つかりません");
    const payment = await this.recordPayment({
      invoiceId,
      customerId: inv.customerId,
      amount: Number(txn.amount),
      method: "bank_transfer",
      paidAt: txn.transaction_date,
      reference: txn.payer_name,
      matchedBy: "manual",
      memo: "銀行明細から消込",
    });
    await this.db
      .from("bank_transactions")
      .update({ matched_invoice_id: invoiceId, matched_payment_id: payment.id })
      .eq("id", txnId);
  }

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const [invoicesRes, paymentsRes, subsRes, plansRes, customersRes] = await Promise.all([
      this.db.from("invoices").select(INVOICE_SELECT),
      this.db.from("payments").select("*"),
      this.db.from("subscriptions").select("*"),
      this.db.from("plans").select("*"),
      this.db.from("customers").select("*"),
    ]);
    return computeDashboardMetrics({
      invoices: (invoicesRes.data ?? []).map(mapInvoice),
      payments: (paymentsRes.data ?? []).map(mapPayment),
      subscriptions: (subsRes.data ?? []).map(mapSubscription),
      plans: (plansRes.data ?? []).map(mapPlan),
      customers: (customersRes.data ?? []).map(mapCustomer),
    });
  }

  async listActivities(limit = 12): Promise<Activity[]> {
    const { data, error } = await this.db
      .from("activities")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapActivity);
  }

  async runRecurringBilling(asOf?: string): Promise<{ created: Invoice[] }> {
    const asOfDate = asOf ?? toISODate(new Date());
    const { data: subs } = await this.db
      .from("subscriptions")
      .select("*")
      .eq("status", "active")
      .is("stripe_subscription_id", null) // Stripe 管理の契約は除外(Stripe が課金)
      .lte("next_billing_date", asOfDate);
    const created: Invoice[] = [];
    for (const subRow of subs ?? []) {
      const sub = mapSubscription(subRow);
      const plan = await this.getPlan(sub.planId);
      if (!plan) continue;
      const period = ym(new Date(sub.nextBillingDate));
      const { data: exists } = await this.db
        .from("invoices")
        .select("id")
        .eq("subscription_id", sub.id)
        .eq("billing_period", period)
        .maybeSingle();
      if (!exists) {
        const customer = await this.getCustomer(sub.customerId);
        const inv = await this.createInvoice({
          customerId: sub.customerId,
          type: "recurring",
          issueDate: `${period}-01`,
          dueDate: sub.nextBillingDate,
          paymentMethod: customer?.paymentMethod ?? "direct_debit",
          billingPeriod: period,
          subscriptionId: sub.id,
          items: [
            {
              description: `${plan.name}（${period}）`,
              quantity: 1,
              unitPrice: plan.amount,
              taxRate: plan.taxRate,
            },
          ],
          status: customer?.paymentMethod === "direct_debit" ? "awaiting_payment" : "sent",
        });
        created.push(inv);
      }
      await this.db
        .from("subscriptions")
        .update({ next_billing_date: computeNextBillingDate(sub.nextBillingDate, sub.billingDay) })
        .eq("id", sub.id);
    }
    return { created };
  }

  // --- Stripe 連携 ---
  async linkStripeCustomer(customerId: string, stripeCustomerId: string): Promise<void> {
    await this.db
      .from("customers")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", customerId);
  }

  async findCustomerByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null> {
    const { data } = await this.db
      .from("customers")
      .select("*")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    return data ? mapCustomer(data) : null;
  }

  async upsertStripeSubscription(input: StripeSubscriptionInput): Promise<Subscription> {
    // limit(1) で複数行時の maybeSingle エラーを回避
    const { data: existingRows } = await this.db
      .from("subscriptions")
      .select("*")
      .eq("stripe_subscription_id", input.stripeSubscriptionId)
      .order("created_at")
      .limit(1);
    const existing = existingRows?.[0];
    if (existing) {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.status === "canceled") patch.canceled_on = toISODate(new Date());
      const { data } = await this.db
        .from("subscriptions")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();
      return mapSubscription(data);
    }
    // プランを名称で検索、無ければ作成
    const { data: planRows } = await this.db
      .from("plans")
      .select("*")
      .eq("name", input.planName)
      .limit(1);
    let planRow = planRows?.[0];
    if (!planRow) {
      const created = await this.db
        .from("plans")
        .insert({
          name: input.planName,
          description: "Stripe連携プラン",
          amount: input.amount,
          tax_rate: 0,
          billing_cycle: "monthly",
          billing_day: 1,
          active: true,
        })
        .select("*")
        .single();
      planRow = created.data;
    }
    const today = toISODate(new Date());
    const { data, error } = await this.db
      .from("subscriptions")
      .insert({
        customer_id: input.customerId,
        plan_id: planRow.id,
        status: input.status,
        started_on: today,
        next_billing_date: computeNextBillingDate(today, planRow.billing_day),
        billing_day: planRow.billing_day,
        stripe_subscription_id: input.stripeSubscriptionId,
      })
      .select("*")
      .single();
    if (error) {
      // 並行再送による一意制約違反なら既存を返す（重複行を作らない）
      if ((error as any).code === "23505") {
        const { data: again } = await this.db
          .from("subscriptions")
          .select("*")
          .eq("stripe_subscription_id", input.stripeSubscriptionId)
          .limit(1);
        if (again?.[0]) return mapSubscription(again[0]);
      }
      throw error;
    }
    // 注: 顧客の payment_method は変更しない（他の口座振替契約の請求方法を壊さないため）。
    return mapSubscription(data);
  }

  async markStripeSubscriptionCanceled(stripeSubscriptionId: string): Promise<void> {
    await this.db
      .from("subscriptions")
      .update({ status: "canceled", canceled_on: toISODate(new Date()) })
      .eq("stripe_subscription_id", stripeSubscriptionId);
  }

  async recordStripeInvoice(input: StripeInvoiceInput): Promise<Invoice | null> {
    const customer = await this.findCustomerByStripeCustomerId(input.stripeCustomerId);
    if (!customer) return null;

    // 冪等化 + 失敗→成功の状態遷移
    const { data: existRows } = await this.db
      .from("invoices")
      .select("*")
      .eq("external_id", input.externalId)
      .limit(1);
    const existing = existRows?.[0];
    if (existing) {
      if (existing.status === "failed" && input.status === "paid") {
        await this.db
          .from("invoices")
          .update({
            status: "paid",
            subtotal: input.total,
            total: input.total,
            amount_paid: input.total,
            paid_at: input.paidAt ?? input.issueDate,
          })
          .eq("id", existing.id);
        await this.db.from("invoice_items").delete().eq("invoice_id", existing.id);
        await this.db.from("invoice_items").insert(
          input.lines.map((l, idx) => ({
            invoice_id: existing.id,
            description: l.description,
            quantity: 1,
            unit_price: l.amount,
            tax_rate: 0,
            amount: l.amount,
            position: idx,
          })),
        );
        await this.db.from("payments").insert({
          invoice_id: existing.id,
          customer_id: customer.id,
          amount: input.total,
          method: "credit_card",
          status: "confirmed",
          paid_at: input.paidAt ?? input.issueDate,
          reference: "Stripe",
          matched_by: "auto",
          memo: "",
        });
        await this.logActivity({
          kind: "payment_confirmed",
          message: `${customer.name} 様のStripe決済（再試行）を確認`,
          actor: "Stripe",
          amount: input.total,
          linkInvoiceId: existing.id,
        });
        const { data: fresh } = await this.db
          .from("invoices")
          .select(INVOICE_SELECT)
          .eq("id", existing.id)
          .single();
        return fresh ? mapInvoice(fresh) : null;
      }
      return null;
    }

    const org = await this.getOrganization();
    const { data: existingNums } = await this.db.from("invoices").select("invoice_number");
    const number = nextInvoiceNumber(
      org.invoicePrefix,
      input.issueDate,
      (existingNums ?? []).map((r: any) => r.invoice_number),
    );
    const { data: subRows } = await this.db
      .from("subscriptions")
      .select("id")
      .eq("customer_id", customer.id)
      .not("stripe_subscription_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const subId = subRows?.[0]?.id ?? null;

    const paid = input.status === "paid";
    const { data: invRow, error } = await this.db
      .from("invoices")
      .insert({
        invoice_number: number,
        customer_id: customer.id,
        subscription_id: subId,
        type: input.type,
        status: paid ? "paid" : "failed",
        issue_date: input.issueDate,
        due_date: input.issueDate,
        billing_period: input.billingPeriod ?? null,
        payment_method: "credit_card",
        subtotal: input.total,
        tax_total: 0,
        total: input.total,
        amount_paid: paid ? input.total : 0,
        notes: "Stripe決済",
        sent_at: new Date().toISOString(),
        paid_at: paid ? input.paidAt ?? input.issueDate : null,
        external_id: input.externalId,
      })
      .select("*")
      .single();
    if (error) {
      // 並行挿入の一意制約違反は冪等スキップ
      if ((error as any).code === "23505") return null;
      throw error;
    }

    // 明細・入金の書き込み。失敗したら請求書を補償削除して再送で作り直させる
    const { error: itemsErr } = await this.db.from("invoice_items").insert(
      input.lines.map((l, idx) => ({
        invoice_id: invRow.id,
        description: l.description,
        quantity: 1,
        unit_price: l.amount,
        tax_rate: 0,
        amount: l.amount,
        position: idx,
      })),
    );
    let payErr: unknown = null;
    if (paid) {
      const r = await this.db.from("payments").insert({
        invoice_id: invRow.id,
        customer_id: customer.id,
        amount: input.total,
        method: "credit_card",
        status: "confirmed",
        paid_at: input.paidAt ?? input.issueDate,
        reference: "Stripe",
        matched_by: "auto",
        memo: input.type === "initial" ? "初期費用＋初月" : "",
      });
      payErr = r.error;
    }
    if (itemsErr || payErr) {
      await this.db.from("invoices").delete().eq("id", invRow.id);
      throw itemsErr || payErr;
    }

    await this.logActivity({
      kind: "payment_confirmed",
      message: paid
        ? `${customer.name} 様のStripe決済を確認`
        : `${customer.name} 様のStripe決済が失敗`,
      actor: "Stripe",
      amount: input.total,
      linkInvoiceId: invRow.id,
    });
    return mapInvoice(invRow);
  }
}
