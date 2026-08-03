import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveContractStatus } from "@/lib/contracts/build";
import { defaultTemplateInput } from "@/lib/contracts/default-template";
import { computeContractHash } from "@/lib/contracts/hash";
import { encryptCredential, maskCredential, revealCredential } from "@/lib/crypto/secrets";
import {
  applicationLinkAvailability,
  applicationNotes,
  generateApplicationToken,
} from "@/lib/domain/application";
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
  Application,
  ApplicationLink,
  ApplicationStatus,
  BankTransaction,
  Contract,
  ContractEvent,
  ContractParty,
  ContractTemplate,
  ContractTerms,
  ContractWithCustomer,
  Customer,
  CustomerStatus,
  DashboardMetrics,
  DevApprovalDecision,
  DevIssue,
  DevIssueApproval,
  DevIssueAttachment,
  DevIssueExecution,
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
  ApplicationCredentials,
  ApplicationInput,
  ApplicationLinkInput,
  ApplicationLinkState,
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
    agencyId: r.agency_id ?? null,
    agencyMemberId: r.agency_member_id ?? null,
  };
}

function mapAgency(r: any): Agency {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    contactName: r.contact_name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    address: r.address ?? "",
    commissionRate: Number(r.commission_rate ?? 0),
    notes: r.notes ?? "",
    active: r.active ?? true,
    createdAt: r.created_at,
  };
}

function mapAgencyMember(r: any): AgencyMember {
  return {
    id: r.id,
    agencyId: r.agency_id,
    name: r.name,
    email: r.email ?? "",
    active: r.active ?? true,
    createdAt: r.created_at,
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
    initialFee: Number(r.initial_fee ?? 0),
    term: (r.term ?? "monthly") as Plan["term"],
    options: Array.isArray(r.options) ? r.options : [],
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
    optionKeys: Array.isArray(r.option_keys) ? r.option_keys : [],
    priceOverride: r.price_override == null ? null : Number(r.price_override),
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

const EMPTY_PARTY: ContractParty = {
  name: "",
  postalCode: "",
  address: "",
  representative: "",
  email: "",
};

const EMPTY_TERMS: ContractTerms = {
  planId: null,
  planName: "",
  optionKeys: [],
  storeCount: 1,
  initialFee: null,
  monthlyFee: null,
  startDate: null,
  notes: "",
};

function mapContractTemplate(r: any): ContractTemplate {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? "",
    docTitle: r.doc_title,
    preamble: r.preamble ?? "",
    sections: Array.isArray(r.sections) ? r.sections : [],
    feeTables: Array.isArray(r.fee_tables) ? r.fee_tables : [],
    providerDefault: { ...EMPTY_PARTY, ...(r.provider_default ?? {}) },
    version: r.version ?? 1,
    active: r.active ?? true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapContract(r: any): Contract {
  return {
    id: r.id,
    contractNumber: r.contract_number,
    customerId: r.customer_id,
    templateId: r.template_id,
    templateVersion: r.template_version,
    title: r.title,
    preamble: r.preamble ?? "",
    status: r.status,
    provider: { ...EMPTY_PARTY, ...(r.provider ?? {}) },
    customerParty: { ...EMPTY_PARTY, ...(r.customer_party ?? {}) },
    sections: Array.isArray(r.sections) ? r.sections : [],
    feeTables: Array.isArray(r.fee_tables) ? r.fee_tables : [],
    terms: { ...EMPTY_TERMS, ...(r.terms ?? {}) },
    signToken: r.sign_token,
    accessCode: r.access_code,
    accessCodeAttempts: r.access_code_attempts ?? 0,
    expiresAt: r.expires_at,
    contentHash: r.content_hash,
    sentAt: r.sent_at,
    firstViewedAt: r.first_viewed_at,
    signedAt: r.signed_at,
    signerName: r.signer_name ?? "",
    signerEmail: r.signer_email ?? "",
    signerIp: r.signer_ip ?? "",
    signerUserAgent: r.signer_user_agent ?? "",
    declinedAt: r.declined_at,
    declineReason: r.decline_reason ?? "",
    canceledAt: r.canceled_at,
    cancelReason: r.cancel_reason ?? "",
    linkedSubscriptionId: r.linked_subscription_id,
    linkedInvoiceId: r.linked_invoice_id,
    createdBy: r.created_by ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapContractEvent(r: any): ContractEvent {
  return {
    id: r.id,
    contractId: r.contract_id,
    type: r.type,
    actor: r.actor ?? "",
    ip: r.ip ?? "",
    userAgent: r.user_agent ?? "",
    detail: r.detail ?? "",
    contentHash: r.content_hash ?? "",
    createdAt: r.created_at,
  };
}

function mapDevApproval(r: any): DevIssueApproval {
  return {
    id: r.id,
    issueId: r.issue_id,
    approverId: r.approver_id,
    approverName: r.approver_name ?? "",
    decision: r.decision,
    createdAt: r.created_at,
  };
}

function mapDevIssue(r: any): DevIssue {
  const approvals = ((r.dev_issue_approvals ?? []) as any[])
    .map(mapDevApproval)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    id: r.id,
    issueNumber: Number(r.issue_number ?? 0),
    title: r.title,
    detail: r.detail ?? "",
    category: r.category,
    priority: r.priority,
    status: r.status,
    execution: r.execution ?? "undecided",
    executionSetByName: r.execution_set_by_name ?? null,
    executionSetAt: r.execution_set_at ?? null,
    requesterId: r.requester_id ?? "",
    requesterName: r.requester_name ?? "",
    scheduledDate: r.scheduled_date,
    completedDate: r.completed_date,
    devNote: r.dev_note ?? "",
    approvals,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapNotification(r: any): AppNotification {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    message: r.message,
    issueId: r.issue_id,
    read: r.read ?? false,
    createdAt: r.created_at,
  };
}

function mapProfile(r: any, email = ""): UserProfile {
  return {
    id: r.id,
    name: r.full_name ?? "",
    email,
    role: (r.role as Role) ?? "staff",
    createdAt: r.created_at,
  };
}

const INVOICE_SELECT = "*, invoice_items(*)";
const CONTRACT_SELECT = "*, customer:customers(*)";
const DEV_ISSUE_SELECT = "*, dev_issue_approvals(*)";
const ATTACHMENT_BUCKET = "dev-issue-attachments";
/** 署名付きURLの有効期限(秒)。ページは都度サーバー描画のため1時間で十分 */
const ATTACHMENT_URL_TTL = 3600;

function mapAttachment(r: any, url: string): DevIssueAttachment {
  return {
    id: r.id,
    issueId: r.issue_id,
    fileName: r.file_name ?? "",
    contentType: r.content_type ?? "image/png",
    url,
    kind: r.kind === "mock" ? "mock" : "screenshot",
    uploadedById: r.uploaded_by_id ?? "",
    uploadedByName: r.uploaded_by_name ?? "",
    createdAt: r.created_at,
  };
}

function mapApplicationLink(r: any): ApplicationLink {
  // applications(count) は [{ count: n }] 形式で返る(select に含めない場合は 0)
  const counts = Array.isArray(r.applications) ? r.applications : [];
  return {
    id: r.id,
    token: r.token,
    name: r.name ?? "",
    active: Boolean(r.active),
    expiresAt: r.expires_at ?? null,
    submissionCount: Number(counts[0]?.count ?? 0),
    createdBy: r.created_by ?? "",
    createdAt: r.created_at,
  };
}

/** DB 行から暗号化済みの連携情報を取り出す(復号・マスクは呼び出し側) */
function rawCredential(
  r: any,
  key: "hotpepper" | "minimo" | "epark",
): { loginId: string | null; password: string | null } | null {
  const loginId = r[`${key}_login_id`] ?? null;
  const password = r[`${key}_password`] ?? null;
  if (!loginId && !password) return null;
  return { loginId, password };
}

/** 申込を画面表示用にマップする(連携情報はマスク済み。平文は含まない) */
function mapApplicationMasked(r: any): Application {
  return {
    id: r.id,
    linkId: r.link_id ?? null,
    linkName: r.link_name ?? "",
    companyName: r.company_name ?? "",
    address: r.address ?? "",
    representativeTitle: r.representative_title ?? "",
    representativeName: r.representative_name ?? "",
    contactName: r.contact_name ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    hotpepper: maskCredential(rawCredential(r, "hotpepper")),
    minimo: maskCredential(rawCredential(r, "minimo")),
    epark: maskCredential(rawCredential(r, "epark")),
    lineRequested: Boolean(r.line_requested),
    status: r.status,
    customerId: r.customer_id ?? null,
    submittedAt: r.submitted_at,
    submittedIp: r.submitted_ip ?? "",
  };
}

/** Supabase(Postgres) 実装。RLS 適用のクライアントを受け取る。 */
export class SupabaseRepository implements Repository {
  constructor(private db: SupabaseClient) {}

  /** 操作ログ(最近の動き)。本体の業務処理を失敗させないため書き込みは best-effort。 */
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
    // error を握りつぶすと、DB 障害や権限不足が「顧客が存在しない」= 404 に
    // 化けて原因が隠れるため、必ず伝播させる(以下の単一行取得も同様)。
    const { data, error } = await this.db
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapCustomer(data) : null;
  }

  async createCustomer(input: CustomerInput): Promise<Customer> {
    let code = input.code;
    if (!code) {
      const { count, error } = await this.db
        .from("customers")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
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
        agency_id: input.agencyId ?? null,
        agency_member_id: input.agencyMemberId ?? null,
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
    if (input.agencyId !== undefined) patch.agency_id = input.agencyId;
    if (input.agencyMemberId !== undefined) patch.agency_member_id = input.agencyMemberId;
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
    const { data, error } = await this.db
      .from("direct_debit_mandates")
      .select("*")
      .eq("customer_id", customerId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapMandate(data) : null;
  }

  async upsertMandate(customerId: string, input: MandateInput): Promise<DirectDebitMandate> {
    const existing = await this.getMandateByCustomer(customerId);
    const registeredAt =
      input.registeredAt !== undefined
        ? input.registeredAt
        : input.status === "active"
          ? toISODate(new Date())
          : (existing?.registeredAt ?? null);
    const row = {
      customer_id: customerId,
      bank_name: input.bankName ?? existing?.bankName ?? "",
      branch_name: input.branchName ?? existing?.branchName ?? "",
      branch_code: input.branchCode ?? existing?.branchCode ?? "",
      account_type: input.accountType ?? existing?.accountType ?? "普通",
      account_number: input.accountNumber ?? existing?.accountNumber ?? "",
      account_holder_kana: input.accountHolderKana ?? existing?.accountHolderKana ?? "",
      status: input.status,
      registered_at: registeredAt,
    };
    const { data, error } = await this.db
      .from("direct_debit_mandates")
      .upsert(row, { onConflict: "customer_id" })
      .select("*")
      .single();
    if (error) throw error;
    return mapMandate(data);
  }

  async listPlans(): Promise<Plan[]> {
    const { data, error } = await this.db.from("plans").select("*").order("amount");
    if (error) throw error;
    return (data ?? []).map(mapPlan);
  }

  async getPlan(id: string): Promise<Plan | null> {
    const { data, error } = await this.db.from("plans").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
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
        initial_fee: input.initialFee ?? 0,
        term: input.term ?? "monthly",
        options: input.options ?? [],
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapPlan(data);
  }

  async updatePlan(id: string, input: Partial<PlanInput>): Promise<Plan> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.amount !== undefined) patch.amount = input.amount;
    if (input.taxRate !== undefined) patch.tax_rate = input.taxRate;
    if (input.billingDay !== undefined) patch.billing_day = input.billingDay;
    if (input.active !== undefined) patch.active = input.active;
    if (input.initialFee !== undefined) patch.initial_fee = input.initialFee;
    if (input.term !== undefined) patch.term = input.term;
    if (input.options !== undefined) patch.options = input.options;
    const { data, error } = await this.db
      .from("plans")
      .update(patch)
      .eq("id", id)
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
        option_keys: input.optionKeys ?? [],
        price_override: input.priceOverride ?? null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapSubscription(data);
  }

  async updateSubscription(id: string, input: SubscriptionUpdateInput): Promise<Subscription> {
    const patch: Record<string, unknown> = {};
    if (input.optionKeys !== undefined) patch.option_keys = input.optionKeys;
    if (input.priceOverride !== undefined) patch.price_override = input.priceOverride;
    if (input.billingDay !== undefined) patch.billing_day = input.billingDay;
    const { data, error } = await this.db
      .from("subscriptions")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapSubscription(data);
  }

  // ---- 営業代理店 ----

  async listAgencies(): Promise<Agency[]> {
    const { data, error } = await this.db.from("agencies").select("*").order("code");
    if (error) throw error;
    return (data ?? []).map(mapAgency);
  }

  async getAgency(id: string): Promise<Agency | null> {
    const { data, error } = await this.db
      .from("agencies")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAgency(data) : null;
  }

  async createAgency(input: AgencyInput): Promise<Agency> {
    let code = input.code;
    if (!code) {
      const { count, error } = await this.db
        .from("agencies")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      code = `AG-${String((count ?? 0) + 1).padStart(3, "0")}`;
    }
    const { data, error } = await this.db
      .from("agencies")
      .insert({
        code,
        name: input.name,
        contact_name: input.contactName ?? "",
        email: input.email ?? "",
        phone: input.phone ?? "",
        address: input.address ?? "",
        commission_rate: input.commissionRate,
        notes: input.notes ?? "",
        active: input.active ?? true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapAgency(data);
  }

  async updateAgency(id: string, input: Partial<AgencyInput>): Promise<Agency> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.contactName !== undefined) patch.contact_name = input.contactName;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.address !== undefined) patch.address = input.address;
    if (input.commissionRate !== undefined) patch.commission_rate = input.commissionRate;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.active !== undefined) patch.active = input.active;
    const { data, error } = await this.db
      .from("agencies")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapAgency(data);
  }

  async listAgencyMembers(agencyId?: string): Promise<AgencyMember[]> {
    let q = this.db.from("agency_members").select("*").order("name");
    if (agencyId) q = q.eq("agency_id", agencyId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapAgencyMember);
  }

  async createAgencyMember(input: AgencyMemberInput): Promise<AgencyMember> {
    const { data, error } = await this.db
      .from("agency_members")
      .insert({
        agency_id: input.agencyId,
        name: input.name,
        email: input.email ?? "",
        active: input.active ?? true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapAgencyMember(data);
  }

  async updateAgencyMember(
    id: string,
    input: Partial<Omit<AgencyMemberInput, "agencyId">>,
  ): Promise<AgencyMember> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.email !== undefined) patch.email = input.email;
    if (input.active !== undefined) patch.active = input.active;
    const { data, error } = await this.db
      .from("agency_members")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapAgencyMember(data);
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
    const { data, error } = await this.db
      .from("invoices")
      .select(`${INVOICE_SELECT}, customer:customers(*)`)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
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
    const { data: existing, error: numsError } = await this.db
      .from("invoices")
      .select("invoice_number");
    if (numsError) throw numsError;
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
        const { error: invUpdError } = await this.db
          .from("invoices")
          .update(patch)
          .eq("id", input.invoiceId);
        if (invUpdError) throw invUpdError;
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
    const { data, error } = await this.db
      .from("direct_debit_batches")
      .select("*, direct_debit_batch_items(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapBatch(data) : null;
  }

  async createBatchFromAwaiting(scheduledDate: string): Promise<DirectDebitBatch> {
    // 既にバッチ済みの請求書IDを除外
    const { data: existingItems, error: itemsError } = await this.db
      .from("direct_debit_batch_items")
      .select("invoice_id");
    if (itemsError) throw itemsError;
    const batched = new Set((existingItems ?? []).map((r: any) => r.invoice_id));
    const { data: invoices, error: invoicesError } = await this.db
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("payment_method", "direct_debit")
      .in("status", ["awaiting_payment", "sent"]);
    if (invoicesError) throw invoicesError;
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
      // 明細の書き込み失敗を握りつぶすと「空のバッチ」が静かに出来上がる
      const { error: insertError } = await this.db.from("direct_debit_batch_items").insert(
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
      if (insertError) throw insertError;
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
      let mandate = null;
      if (item.mandateId) {
        const { data, error } = await this.db
          .from("direct_debit_mandates")
          .select("*")
          .eq("id", item.mandateId)
          .maybeSingle();
        // DB エラーを「口座無効=引落失敗」と誤判定しないよう伝播させる
        if (error) throw error;
        mandate = data;
      }
      const ok = mandate?.status === "active";
      if (ok) {
        const { error: okError } = await this.db
          .from("direct_debit_batch_items")
          .update({ result: "success" })
          .eq("id", item.id);
        if (okError) throw okError;
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
        const { error: ngError } = await this.db
          .from("direct_debit_batch_items")
          .update({
            result: "failed",
            result_reason: mandate ? "口座振替の登録が有効ではありません" : "残高不足",
          })
          .eq("id", item.id);
        if (ngError) throw ngError;
        const { error: invError } = await this.db
          .from("invoices")
          .update({ status: "failed" })
          .eq("id", item.invoiceId);
        if (invError) throw invError;
        failed++;
      }
    }
    const { error: doneError } = await this.db
      .from("direct_debit_batches")
      .update({ status: "completed" })
      .eq("id", id);
    if (doneError) throw doneError;
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
    const { data: txn, error: txnError } = await this.db
      .from("bank_transactions")
      .select("*")
      .eq("id", txnId)
      .maybeSingle();
    if (txnError) throw txnError;
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
    const { error: matchError } = await this.db
      .from("bank_transactions")
      .update({ matched_invoice_id: invoiceId, matched_payment_id: payment.id })
      .eq("id", txnId);
    if (matchError) throw matchError;
  }

  async getDashboardMetrics(month?: string): Promise<DashboardMetrics> {
    const [invoicesRes, paymentsRes, subsRes, plansRes, customersRes] = await Promise.all([
      this.db.from("invoices").select(INVOICE_SELECT),
      this.db.from("payments").select("*"),
      this.db.from("subscriptions").select("*"),
      this.db.from("plans").select("*"),
      this.db.from("customers").select("*"),
    ]);
    // 読み取り失敗を握りつぶすと売上ゼロ等の誤った数値を表示してしまう
    for (const res of [invoicesRes, paymentsRes, subsRes, plansRes, customersRes]) {
      if (res.error) throw res.error;
    }
    return computeDashboardMetrics({
      invoices: (invoicesRes.data ?? []).map(mapInvoice),
      payments: (paymentsRes.data ?? []).map(mapPayment),
      subscriptions: (subsRes.data ?? []).map(mapSubscription),
      plans: (plansRes.data ?? []).map(mapPlan),
      customers: (customersRes.data ?? []).map(mapCustomer),
      month,
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
    const { data: subs, error: subsError } = await this.db
      .from("subscriptions")
      .select("*")
      .eq("status", "active")
      .is("stripe_subscription_id", null) // Stripe 管理の契約は除外(Stripe が課金)
      .lte("next_billing_date", asOfDate);
    if (subsError) throw subsError;
    const created: Invoice[] = [];
    for (const subRow of subs ?? []) {
      const sub = mapSubscription(subRow);
      const plan = await this.getPlan(sub.planId);
      if (!plan) continue;
      const period = ym(new Date(sub.nextBillingDate));
      // エラーを「未生成」と誤判定すると請求書が二重生成されるため伝播させる
      const { data: exists, error: existsError } = await this.db
        .from("invoices")
        .select("id")
        .eq("subscription_id", sub.id)
        .eq("billing_period", period)
        .maybeSingle();
      if (existsError) throw existsError;
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
          items: subscriptionItems(plan, sub.optionKeys ?? [], period, sub.priceOverride),
          status: customer?.paymentMethod === "direct_debit" ? "awaiting_payment" : "sent",
        });
        created.push(inv);
      }
      const { error: nextError } = await this.db
        .from("subscriptions")
        .update({ next_billing_date: computeNextBillingDate(sub.nextBillingDate, sub.billingDay) })
        .eq("id", sub.id);
      if (nextError) throw nextError;
    }
    return { created };
  }

  // ---- 契約書テンプレート ----

  async listContractTemplates(): Promise<ContractTemplate[]> {
    const { data, error } = await this.db
      .from("contract_templates")
      .select("*")
      .order("created_at");
    if (error) throw error;
    if (!(data ?? []).some((r: any) => r.slug === defaultTemplateInput.slug)) {
      // 既定テンプレートを初回アクセス時に自動投入(slug 一意制約で競合は無視)
      await this.db
        .from("contract_templates")
        .upsert(
          {
            slug: defaultTemplateInput.slug,
            name: defaultTemplateInput.name,
            description: defaultTemplateInput.description,
            doc_title: defaultTemplateInput.docTitle,
            preamble: defaultTemplateInput.preamble,
            sections: defaultTemplateInput.sections,
            fee_tables: defaultTemplateInput.feeTables,
            provider_default: defaultTemplateInput.providerDefault,
            version: 1,
            active: true,
          },
          { onConflict: "slug", ignoreDuplicates: true },
        );
      const { data: again, error: err2 } = await this.db
        .from("contract_templates")
        .select("*")
        .order("created_at");
      if (err2) throw err2;
      return (again ?? []).map(mapContractTemplate);
    }
    return (data ?? []).map(mapContractTemplate);
  }

  async getContractTemplate(id: string): Promise<ContractTemplate | null> {
    const { data, error } = await this.db
      .from("contract_templates")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapContractTemplate(data) : null;
  }

  async createContractTemplate(input: ContractTemplateInput): Promise<ContractTemplate> {
    const { data, error } = await this.db
      .from("contract_templates")
      .insert({
        slug: input.slug ?? genId("tpl"),
        name: input.name,
        description: input.description ?? "",
        doc_title: input.docTitle,
        preamble: input.preamble ?? "",
        sections: input.sections,
        fee_tables: input.feeTables,
        provider_default: input.providerDefault,
        version: 1,
        active: input.active ?? true,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapContractTemplate(data);
  }

  async updateContractTemplate(
    id: string,
    input: Partial<ContractTemplateInput>,
  ): Promise<ContractTemplate> {
    const current = await this.getContractTemplate(id);
    if (!current) throw new Error("テンプレートが見つかりません");
    const patch: Record<string, unknown> = { version: current.version + 1 };
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.docTitle !== undefined) patch.doc_title = input.docTitle;
    if (input.preamble !== undefined) patch.preamble = input.preamble;
    if (input.sections !== undefined) patch.sections = input.sections;
    if (input.feeTables !== undefined) patch.fee_tables = input.feeTables;
    if (input.providerDefault !== undefined) patch.provider_default = input.providerDefault;
    if (input.active !== undefined) patch.active = input.active;
    const { data, error } = await this.db
      .from("contract_templates")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapContractTemplate(data);
  }

  // ---- 契約書 / 電子契約 ----

  private async logContractEvent(contractId: string, e: ContractEventInput): Promise<void> {
    const { error } = await this.db.from("contract_events").insert({
      contract_id: contractId,
      type: e.type,
      actor: e.actor,
      ip: e.ip ?? "",
      user_agent: e.userAgent ?? "",
      detail: e.detail ?? "",
      content_hash: e.contentHash ?? "",
    });
    if (error) throw error;
  }

  private decorateContract(r: any): ContractWithCustomer {
    const c = mapContract(r);
    return {
      ...c,
      status: effectiveContractStatus(c),
      customer: mapCustomer(r.customer),
    };
  }

  /**
   * 保存値そのままの契約(実効ステータス補正なし)。
   * 状態遷移の判定に使う。getContract() は期限切れを expired に補正するため、
   * それで判定すると期限切れ契約の再送・取消・書面締結登録ができなくなる。
   */
  private async rawContract(id: string): Promise<Contract | null> {
    const { data, error } = await this.db
      .from("contracts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapContract(data) : null;
  }

  private async rawContractByToken(token: string): Promise<Contract | null> {
    if (!token) return null;
    const { data, error } = await this.db
      .from("contracts")
      .select("*")
      .eq("sign_token", token)
      .maybeSingle();
    if (error) throw error;
    return data ? mapContract(data) : null;
  }

  /** アクセスコード失敗の原子的カウント(加算後の値を返す) */
  private async bumpCodeAttempts(contractId: string, fallback: number): Promise<number> {
    const { data, error } = await this.db.rpc("bump_contract_code_attempts", {
      cid: contractId,
    });
    if (error || typeof data !== "number") return fallback + 1;
    return data;
  }

  async listContracts(filter?: ContractFilter): Promise<ContractWithCustomer[]> {
    let q = this.db
      .from("contracts")
      .select(CONTRACT_SELECT)
      .order("created_at", { ascending: false });
    if (filter?.customerId) q = q.eq("customer_id", filter.customerId);
    const { data, error } = await q;
    if (error) throw error;
    let list = (data ?? []).map((r: any) => this.decorateContract(r));
    if (filter?.status && filter.status !== "all") {
      list = list.filter((c) => c.status === filter.status);
    }
    if (filter?.search) {
      const s = filter.search.toLowerCase();
      list = list.filter(
        (c) =>
          c.contractNumber.toLowerCase().includes(s) ||
          c.title.toLowerCase().includes(s) ||
          c.customer?.name.toLowerCase().includes(s),
      );
    }
    return list;
  }

  async getContract(id: string): Promise<ContractWithCustomer | null> {
    const { data, error } = await this.db
      .from("contracts")
      .select(CONTRACT_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.decorateContract(data) : null;
  }

  async getContractByToken(token: string): Promise<ContractWithCustomer | null> {
    if (!token) return null;
    const { data, error } = await this.db
      .from("contracts")
      .select(CONTRACT_SELECT)
      .eq("sign_token", token)
      .maybeSingle();
    if (error) throw error;
    return data ? this.decorateContract(data) : null;
  }

  async createContract(input: ContractInput): Promise<Contract> {
    const { data: existing, error: numsError } = await this.db
      .from("contracts")
      .select("contract_number");
    if (numsError) throw numsError;
    const number = nextInvoiceNumber(
      "CTR",
      toISODate(new Date()),
      (existing ?? []).map((r: any) => r.contract_number),
    );
    const { data, error } = await this.db
      .from("contracts")
      .insert({
        contract_number: number,
        customer_id: input.customerId,
        template_id: input.templateId ?? null,
        template_version: input.templateVersion ?? null,
        title: input.title,
        preamble: input.preamble ?? "",
        status: "draft",
        provider: input.provider,
        customer_party: input.customerParty,
        sections: input.sections,
        fee_tables: input.feeTables,
        terms: input.terms,
        created_by: input.createdBy ?? "",
      })
      .select("*")
      .single();
    if (error) throw error;
    await this.logContractEvent(data.id, {
      type: "created",
      actor: input.createdBy || "担当者",
      detail: "契約書を作成",
    });
    await this.logActivity({
      kind: "contract_created",
      message: `契約書 ${number} を作成`,
      actor: input.createdBy || "担当者",
      amount: null,
      linkInvoiceId: null,
    });
    return mapContract(data);
  }

  async updateContractDraft(id: string, input: Partial<ContractInput>): Promise<Contract> {
    const current = await this.rawContract(id);
    if (!current) throw new Error("契約書が見つかりません");
    if (current.status !== "draft") {
      throw new Error("送付済みの契約書は編集できません。取消して新しい契約書を作成してください。");
    }
    const patch: Record<string, unknown> = {};
    if (input.customerId !== undefined) patch.customer_id = input.customerId;
    if (input.title !== undefined) patch.title = input.title;
    if (input.preamble !== undefined) patch.preamble = input.preamble;
    if (input.provider !== undefined) patch.provider = input.provider;
    if (input.customerParty !== undefined) patch.customer_party = input.customerParty;
    if (input.sections !== undefined) patch.sections = input.sections;
    if (input.feeTables !== undefined) patch.fee_tables = input.feeTables;
    if (input.terms !== undefined) patch.terms = input.terms;
    const { data, error } = await this.db
      .from("contracts")
      .update(patch)
      .eq("id", id)
      .eq("status", "draft") // 競合ガード: 下書きの間のみ更新
      .select("*");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("他の操作と競合しました。画面を更新して再度お試しください。");
    }
    await this.logContractEvent(id, {
      type: "updated",
      actor: input.createdBy || "担当者",
      detail: "下書きを更新",
    });
    return mapContract(data[0]);
  }

  async markContractSent(id: string, params: ContractSendParams): Promise<Contract> {
    const current = await this.rawContract(id);
    if (!current) throw new Error("契約書が見つかりません");
    if (!["draft", "sent", "viewed"].includes(current.status)) {
      throw new Error("このステータスの契約書は送付できません");
    }
    const isResend = current.status !== "draft";
    if (isResend && current.contentHash && current.contentHash !== params.contentHash) {
      throw new Error("契約内容のハッシュが一致しません(内容が変更されています)");
    }
    const { data, error } = await this.db
      .from("contracts")
      .update({
        status: "sent",
        sign_token: params.token,
        access_code: params.accessCode,
        access_code_attempts: 0,
        expires_at: params.expiresAt,
        content_hash: params.contentHash,
        sent_at: new Date().toISOString(),
        signer_email: params.signerEmail,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    await this.logContractEvent(id, {
      type: "sent",
      actor: params.actor,
      ip: params.ip,
      userAgent: params.userAgent,
      detail: `${isResend ? "再送信(トークン再発行)" : "署名依頼を送付"}: ${params.signerEmail}${params.accessCode ? " / アクセスコードあり" : ""}`,
      contentHash: params.contentHash,
    });
    await this.logActivity({
      kind: "contract_sent",
      message: `契約書 ${current.contractNumber} の署名依頼を送付`,
      actor: params.actor,
      amount: null,
      linkInvoiceId: null,
    });
    return mapContract(data);
  }

  async recordContractViewed(
    token: string,
    meta: { ip: string; userAgent: string },
  ): Promise<void> {
    const c = await this.rawContractByToken(token);
    if (!c) return;
    if (c.status !== "sent" && c.status !== "viewed") return;
    const patch: Record<string, unknown> = {};
    if (!c.firstViewedAt) patch.first_viewed_at = new Date().toISOString();
    if (c.status === "sent") patch.status = "viewed";
    if (Object.keys(patch).length > 0) {
      const { error } = await this.db.from("contracts").update(patch).eq("id", c.id);
      if (error) return; // 状態を更新できなかった場合は証跡も残さない(不整合防止)
    }
    await this.logContractEvent(c.id, {
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
    const c = await this.rawContractByToken(token);
    if (!c) return { ok: false, error: "契約書が見つかりません" };
    if (!c.accessCode) return { ok: true };
    if (c.accessCodeAttempts >= CONTRACT_CODE_MAX_ATTEMPTS) {
      return { ok: false, locked: true, error: "試行回数の上限に達しました。送信元にお問い合わせください。" };
    }
    if (code === c.accessCode) {
      await this.logContractEvent(c.id, {
        type: "code_verified",
        actor: c.customerParty.representative || "契約者",
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await this.recordContractViewed(token, meta);
      return { ok: true };
    }
    const attempts = await this.bumpCodeAttempts(c.id, c.accessCodeAttempts);
    await this.logContractEvent(c.id, {
      type: "code_failed",
      actor: "契約者",
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail: `失敗 ${attempts} 回目`,
    });
    const locked = attempts >= CONTRACT_CODE_MAX_ATTEMPTS;
    return {
      ok: false,
      locked,
      error: locked
        ? "試行回数の上限に達しました。送信元にお問い合わせください。"
        : "アクセスコードが一致しません",
    };
  }

  async signContract(token: string, params: ContractSignParams): Promise<ContractActionResult> {
    const c = await this.rawContractByToken(token);
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
        const attempts = await this.bumpCodeAttempts(c.id, c.accessCodeAttempts);
        await this.logContractEvent(c.id, {
          type: "code_failed",
          actor: "契約者",
          ip: params.ip,
          userAgent: params.userAgent,
          detail: `署名時のコード不一致 (失敗 ${attempts} 回目)`,
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
    const { data, error } = await this.db
      .from("contracts")
      .update({
        status: "signed",
        signed_at: now,
        signer_name: params.signerName,
        signer_ip: params.ip,
        signer_user_agent: params.userAgent,
      })
      .eq("id", c.id)
      .in("status", ["sent", "viewed"]) // 競合ガード(二重署名防止)
      .select("*");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return { ok: false, error: "この契約書は既に処理されています" };
    }
    await this.logContractEvent(c.id, {
      type: "signed",
      actor: params.signerName,
      ip: params.ip,
      userAgent: params.userAgent,
      detail: "電子署名(同意)。内容ハッシュ照合 OK",
      contentHash: c.contentHash,
    });
    await this.logActivity({
      kind: "contract_signed",
      message: `契約書 ${c.contractNumber} に電子署名されました`,
      actor: params.signerName,
      amount: null,
      linkInvoiceId: null,
    });
    return { ok: true, contract: mapContract(data[0]) };
  }

  async declineContract(
    token: string,
    params: { reason: string; accessCode?: string; ip: string; userAgent: string },
  ): Promise<ContractActionResult> {
    const c = await this.rawContractByToken(token);
    if (!c) return { ok: false, error: "契約書が見つかりません" };
    if (c.status !== "sent" && c.status !== "viewed") {
      return { ok: false, error: "この契約書は辞退できる状態ではありません" };
    }
    if (c.accessCode) {
      if (c.accessCodeAttempts >= CONTRACT_CODE_MAX_ATTEMPTS) {
        return { ok: false, locked: true, error: "試行回数の上限に達しました" };
      }
      if (params.accessCode !== c.accessCode) {
        const attempts = await this.bumpCodeAttempts(c.id, c.accessCodeAttempts);
        await this.logContractEvent(c.id, {
          type: "code_failed",
          actor: "契約者",
          ip: params.ip,
          userAgent: params.userAgent,
          detail: `辞退時のコード不一致 (失敗 ${attempts} 回目)`,
        });
        return { ok: false, error: "アクセスコードが一致しません" };
      }
    }
    const { data, error } = await this.db
      .from("contracts")
      .update({
        status: "declined",
        declined_at: new Date().toISOString(),
        decline_reason: params.reason,
      })
      .eq("id", c.id)
      .in("status", ["sent", "viewed"])
      .select("*");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) {
      return { ok: false, error: "この契約書は既に処理されています" };
    }
    await this.logContractEvent(c.id, {
      type: "declined",
      actor: c.customerParty.representative || "契約者",
      ip: params.ip,
      userAgent: params.userAgent,
      detail: params.reason,
    });
    return { ok: true, contract: mapContract(data[0]) };
  }

  async cancelContract(id: string, reason: string, actor: string): Promise<Contract> {
    const current = await this.rawContract(id);
    if (!current) throw new Error("契約書が見つかりません");
    if (!["draft", "sent", "viewed"].includes(current.status)) {
      throw new Error("締結済み・終了済みの契約書は取消できません");
    }
    const { data, error } = await this.db
      .from("contracts")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        cancel_reason: reason,
        sign_token: null, // 署名リンクを無効化
      })
      .eq("id", id)
      .in("status", ["draft", "sent", "viewed"])
      .select("*");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("他の操作と競合しました。画面を更新して再度お試しください。");
    }
    await this.logContractEvent(id, { type: "canceled", actor, detail: reason });
    return mapContract(data[0]);
  }

  async markContractSignedManually(
    id: string,
    params: { signerName: string; signedAt: string; note: string; actor: string },
  ): Promise<Contract> {
    const current = await this.rawContract(id);
    if (!current) throw new Error("契約書が見つかりません");
    if (!["draft", "sent", "viewed"].includes(current.status)) {
      throw new Error("このステータスの契約書は締結登録できません");
    }
    const contentHash = current.contentHash ?? computeContractHash(current);
    const patch: Record<string, unknown> = {
      status: "signed",
      signed_at: params.signedAt,
      signer_name: params.signerName,
      sign_token: null, // 未使用の署名リンクを無効化
    };
    // 未送付(下書き)から直接締結する場合のみ内容を凍結
    if (!current.contentHash) patch.content_hash = contentHash;
    const { data: rows, error } = await this.db
      .from("contracts")
      .update(patch)
      .eq("id", id)
      .in("status", ["draft", "sent", "viewed"])
      .select("*");
    if (error) throw error;
    if (!rows || rows.length === 0) {
      throw new Error("他の操作と競合しました。画面を更新して再度お試しください。");
    }
    const data = rows[0];
    await this.logContractEvent(id, {
      type: "manual_signed",
      actor: params.actor,
      detail: `書面締結を登録: 署名者 ${params.signerName}${params.note ? ` / ${params.note}` : ""}`,
      contentHash,
    });
    return mapContract(data);
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
    const patch: Record<string, unknown> = {};
    if (params.subscriptionId !== undefined) patch.linked_subscription_id = params.subscriptionId;
    if (params.invoiceId !== undefined) patch.linked_invoice_id = params.invoiceId;
    let q = this.db.from("contracts").update(patch).eq("id", id);
    if (params.guardUnlinked) {
      // 並行実行ガード: 未紐付けの場合のみ更新できる
      q = q.is("linked_subscription_id", null).is("linked_invoice_id", null);
    }
    const { data, error } = await q.select("*");
    if (error) throw error;
    if (!data || data.length === 0) {
      if (params.guardUnlinked) return null; // 先に別の実行が紐付け済み
      throw new Error("契約書が見つかりません");
    }
    await this.logContractEvent(id, {
      type: "billing_linked",
      actor: params.actor,
      detail: params.detail ?? "請求連携を開始",
    });
    return mapContract(data[0]);
  }

  async listContractEvents(contractId: string): Promise<ContractEvent[]> {
    const { data, error } = await this.db
      .from("contract_events")
      .select("*")
      .eq("contract_id", contractId)
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map(mapContractEvent);
  }

  async addContractEvent(contractId: string, event: ContractEventInput): Promise<void> {
    await this.logContractEvent(contractId, event);
  }

  // --- Stripe 連携 ---
  async linkStripeCustomer(customerId: string, stripeCustomerId: string): Promise<void> {
    const { error } = await this.db
      .from("customers")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", customerId);
    if (error) throw error;
  }

  async findCustomerByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null> {
    const { data, error } = await this.db
      .from("customers")
      .select("*")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    // エラーを「顧客未連携」と誤判定すると Webhook が入金記録をスキップする
    if (error) throw error;
    return data ? mapCustomer(data) : null;
  }

  async upsertStripeSubscription(input: StripeSubscriptionInput): Promise<Subscription> {
    // limit(1) で複数行時の maybeSingle エラーを回避
    const { data: existingRows, error: existingError } = await this.db
      .from("subscriptions")
      .select("*")
      .eq("stripe_subscription_id", input.stripeSubscriptionId)
      .order("created_at")
      .limit(1);
    if (existingError) throw existingError;
    const existing = existingRows?.[0];
    if (existing) {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.status === "canceled") patch.canceled_on = toISODate(new Date());
      const { data, error } = await this.db
        .from("subscriptions")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      return mapSubscription(data);
    }
    // プランを名称で検索、無ければ作成
    const { data: planRows, error: planError } = await this.db
      .from("plans")
      .select("*")
      .eq("name", input.planName)
      .limit(1);
    if (planError) throw planError;
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
          initial_fee: 0,
          term: "monthly",
          options: [],
        })
        .select("*")
        .single();
      if (created.error) throw created.error;
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
        option_keys: [],
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
    const { error } = await this.db
      .from("subscriptions")
      .update({ status: "canceled", canceled_on: toISODate(new Date()) })
      .eq("stripe_subscription_id", stripeSubscriptionId);
    if (error) throw error;
  }

  async recordStripeInvoice(input: StripeInvoiceInput): Promise<Invoice | null> {
    const customer = await this.findCustomerByStripeCustomerId(input.stripeCustomerId);
    if (!customer) return null;

    // 冪等化 + 失敗→成功の状態遷移
    const { data: existRows, error: existError } = await this.db
      .from("invoices")
      .select("*")
      .eq("external_id", input.externalId)
      .limit(1);
    if (existError) throw existError;
    const existing = existRows?.[0];
    if (existing) {
      if (existing.status === "failed" && input.status === "paid") {
        // 書き込み失敗を握りつぶすと 200 を返してしまい Stripe が再送しない
        // (=入金記録が失われる)ため、必ず伝播させて再送させる。
        const { error: updError } = await this.db
          .from("invoices")
          .update({
            status: "paid",
            subtotal: input.total,
            total: input.total,
            amount_paid: input.total,
            paid_at: input.paidAt ?? input.issueDate,
          })
          .eq("id", existing.id);
        if (updError) throw updError;
        const { error: delError } = await this.db
          .from("invoice_items")
          .delete()
          .eq("invoice_id", existing.id);
        if (delError) throw delError;
        const { error: insError } = await this.db.from("invoice_items").insert(
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
        if (insError) throw insError;
        const { error: payError } = await this.db.from("payments").insert({
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
        if (payError) throw payError;
        await this.logActivity({
          kind: "payment_confirmed",
          message: `${customer.name} 様のStripe決済（再試行）を確認`,
          actor: "Stripe",
          amount: input.total,
          linkInvoiceId: existing.id,
        });
        const { data: fresh, error: freshError } = await this.db
          .from("invoices")
          .select(INVOICE_SELECT)
          .eq("id", existing.id)
          .single();
        if (freshError) throw freshError;
        return fresh ? mapInvoice(fresh) : null;
      }
      return null;
    }

    const org = await this.getOrganization();
    const { data: existingNums, error: numsError } = await this.db
      .from("invoices")
      .select("invoice_number");
    if (numsError) throw numsError;
    const number = nextInvoiceNumber(
      org.invoicePrefix,
      input.issueDate,
      (existingNums ?? []).map((r: any) => r.invoice_number),
    );
    const { data: subRows, error: subError } = await this.db
      .from("subscriptions")
      .select("id")
      .eq("customer_id", customer.id)
      .not("stripe_subscription_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (subError) throw subError;
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

  // --- 開発依頼 / 進捗管理 ---

  async listDevIssues(filter?: DevIssueFilter): Promise<DevIssue[]> {
    let q = this.db
      .from("dev_issues")
      .select(DEV_ISSUE_SELECT)
      .order("created_at", { ascending: false });
    if (filter?.status && filter.status !== "all") q = q.eq("status", filter.status);
    if (filter?.category && filter.category !== "all") q = q.eq("category", filter.category);
    if (filter?.priority && filter.priority !== "all") q = q.eq("priority", filter.priority);
    if (filter?.search) {
      const s = `%${filter.search}%`;
      q = q.or(`title.ilike.${s},detail.ilike.${s},dev_note.ilike.${s},requester_name.ilike.${s}`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapDevIssue);
  }

  async getDevIssue(id: string): Promise<DevIssue | null> {
    const { data, error } = await this.db
      .from("dev_issues")
      .select(DEV_ISSUE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapDevIssue(data) : null;
  }

  async createDevIssue(input: DevIssueInput): Promise<DevIssue> {
    const { data, error } = await this.db
      .from("dev_issues")
      .insert({
        title: input.title,
        detail: input.detail ?? "",
        category: input.category,
        priority: input.priority ?? "medium",
        status: "open",
        execution: "undecided",
        // デモID等の uuid でない依頼者IDは NULL(表示は requester_name を使う)
        requester_id: isUuid(input.requester.id) ? input.requester.id : null,
        requester_name: input.requester.name,
      })
      .select(DEV_ISSUE_SELECT)
      .single();
    if (error) throw error;
    const issue = mapDevIssue(data);
    // 通知のための依頼者IDは元の値を保持する
    issue.requesterId = input.requester.id;
    await this.notifyDevIssue(
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
    const before = await this.getDevIssue(id);
    if (!before) throw new Error("開発依頼が見つかりません");
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.detail !== undefined) patch.detail = input.detail;
    if (input.category !== undefined) patch.category = input.category;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.status !== undefined) patch.status = input.status;
    if (input.scheduledDate !== undefined) patch.scheduled_date = input.scheduledDate;
    if (input.completedDate !== undefined) patch.completed_date = input.completedDate;
    if (input.devNote !== undefined) patch.dev_note = input.devNote;
    // 対応完了にした場合、完了日が未入力なら当日を補完する
    const nextStatus = (input.status ?? before.status) as DevIssue["status"];
    const nextCompleted =
      input.completedDate !== undefined ? input.completedDate : before.completedDate;
    if (nextStatus === "done" && !nextCompleted) {
      patch.completed_date = toISODate(new Date());
    }
    if (Object.keys(patch).length === 0) return before;
    const { data, error } = await this.db
      .from("dev_issues")
      .update(patch)
      .eq("id", id)
      .select(DEV_ISSUE_SELECT)
      .single();
    if (error) throw error;
    const issue = mapDevIssue(data);
    if (issue.status !== before.status) {
      if (issue.status === "done") {
        await this.notifyDevIssue(
          "issue_done",
          issue,
          `#${issue.issueNumber}「${issue.title}」が対応完了になりました（${actor.name}）`,
          actor.id,
        );
      } else if (issue.status === "hearing") {
        await this.notifyDevIssue(
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
    const before = await this.getDevIssue(issueId);
    if (!before) throw new Error("開発依頼が見つかりません");
    // 自分の判定を入れ替える(取消は削除のみ)
    const { error: delError } = await this.db
      .from("dev_issue_approvals")
      .delete()
      .eq("issue_id", issueId)
      .eq("approver_id", approver.id);
    if (delError) throw delError;
    if (decision) {
      const { error: insError } = await this.db.from("dev_issue_approvals").insert({
        issue_id: issueId,
        approver_id: approver.id,
        approver_name: approver.name,
        decision,
      });
      if (insError) throw insError;
    }
    const { data: apRows, error: apError } = await this.db
      .from("dev_issue_approvals")
      .select("*")
      .eq("issue_id", issueId);
    if (apError) throw apError;
    const execution = computeDevExecution(
      (apRows ?? []).map((r: any) => r.decision as DevApprovalDecision),
    );
    // 全体管理者が直接設定している間は、承諾の増減で実行有無を上書きしない
    const patch = before.executionSetByName ? {} : { execution };
    const { data, error } = await this.db
      .from("dev_issues")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", issueId)
      .select(DEV_ISSUE_SELECT)
      .single();
    if (error) throw error;
    const issue = mapDevIssue(data);
    if (issue.execution !== before.execution && issue.execution !== "undecided") {
      await this.notifyDevIssue(
        "issue_execution",
        issue,
        `#${issue.issueNumber}「${issue.title}」の実行有無が「${devIssueExecutionLabels[issue.execution]}」になりました`,
        approver.id,
      );
    }
    return issue;
  }

  async setDevIssueExecution(
    issueId: string,
    execution: DevIssueExecution | null,
    actor: ActorRef,
  ): Promise<DevIssue> {
    const before = await this.getDevIssue(issueId);
    if (!before) throw new Error("開発依頼が見つかりません");
    let patch: Record<string, unknown>;
    if (execution === null) {
      // 直接設定を解除し、承諾状況からの自動判定に戻す
      const { data: apRows, error: apError } = await this.db
        .from("dev_issue_approvals")
        .select("decision")
        .eq("issue_id", issueId);
      if (apError) throw apError;
      patch = {
        execution: computeDevExecution(
          (apRows ?? []).map((r: any) => r.decision as DevApprovalDecision),
        ),
        execution_set_by_name: null,
        execution_set_at: null,
      };
    } else {
      patch = {
        execution,
        execution_set_by_name: actor.name,
        execution_set_at: new Date().toISOString(),
      };
    }
    const { data, error } = await this.db
      .from("dev_issues")
      .update(patch)
      .eq("id", issueId)
      .select(DEV_ISSUE_SELECT)
      .single();
    if (error) throw error;
    const issue = mapDevIssue(data);
    if (issue.execution !== before.execution && issue.execution !== "undecided") {
      await this.notifyDevIssue(
        "issue_execution",
        issue,
        `#${issue.issueNumber}「${issue.title}」の実行有無が「${devIssueExecutionLabels[issue.execution]}」になりました（${actor.name}）`,
        actor.id,
      );
    }
    return issue;
  }

  // --- 開発依頼の添付画像 (Supabase Storage) ---

  /** バケットが無ければ作成(マイグレーションで作成済みなら何もしない) */
  private attachmentBucketReady = false;
  private async ensureAttachmentBucket(): Promise<void> {
    if (this.attachmentBucketReady) return;
    try {
      const { error } = await this.db.storage.createBucket(ATTACHMENT_BUCKET, {
        public: false,
      });
      // 既存(重複)エラーは成功扱い
      if (error && !/already exists|duplicate/i.test(error.message)) throw error;
      this.attachmentBucketReady = true;
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/already exists|duplicate/i.test(msg)) {
        this.attachmentBucketReady = true;
        return;
      }
      throw new Error(
        "添付画像の保存先(Storageバケット)を作成できませんでした。" +
          "SUPABASE_SERVICE_ROLE_KEY の設定を確認してください: " + msg,
      );
    }
  }

  async listDevIssueAttachments(issueId: string): Promise<DevIssueAttachment[]> {
    const { data, error } = await this.db
      .from("dev_issue_attachments")
      .select("*")
      .eq("issue_id", issueId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];
    const { data: signed, error: signError } = await this.db.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrls(rows.map((r: any) => r.storage_path), ATTACHMENT_URL_TTL);
    if (signError) throw signError;
    const urlByPath = new Map<string, string>();
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
    return rows.map((r: any) => mapAttachment(r, urlByPath.get(r.storage_path) ?? ""));
  }

  async addDevIssueAttachment(
    issueId: string,
    input: DevIssueAttachmentInput,
  ): Promise<DevIssueAttachment> {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(input.dataUrl);
    if (!match) throw new Error("画像データの形式が不正です");
    const contentType = input.contentType || match[1];
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.byteLength > 6 * 1024 * 1024) {
      throw new Error("画像が大きすぎます(6MBまで)。縮小して再度お試しください");
    }
    await this.ensureAttachmentBucket();
    const id = genId("att");
    const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
    const path = `${issueId}/${id}.${ext}`;
    const { error: upError } = await this.db.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (upError) throw new Error("画像のアップロードに失敗しました: " + upError.message);
    const { data, error } = await this.db
      .from("dev_issue_attachments")
      .insert({
        issue_id: issueId,
        file_name: input.fileName,
        content_type: contentType,
        storage_path: path,
        kind: input.kind,
        uploaded_by_id: isUuid(input.uploadedBy.id) ? input.uploadedBy.id : null,
        uploaded_by_name: input.uploadedBy.name,
      })
      .select("*")
      .single();
    if (error) {
      // メタデータ登録に失敗したら実体も掃除して再送可能にする
      await this.db.storage.from(ATTACHMENT_BUCKET).remove([path]);
      throw error;
    }
    const { data: signed } = await this.db.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(path, ATTACHMENT_URL_TTL);
    const att = mapAttachment(data, signed?.signedUrl ?? "");
    // 削除権限の判定にはデモID等も使うため元の値を保持
    att.uploadedById = input.uploadedBy.id;
    return att;
  }

  async getDevIssueAttachment(id: string): Promise<DevIssueAttachment | null> {
    const { data, error } = await this.db
      .from("dev_issue_attachments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { data: signed } = await this.db.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(data.storage_path, ATTACHMENT_URL_TTL);
    return mapAttachment(data, signed?.signedUrl ?? "");
  }

  async deleteDevIssueAttachment(id: string): Promise<void> {
    const { data, error } = await this.db
      .from("dev_issue_attachments")
      .select("id, storage_path")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("添付画像が見つかりません");
    const { error: delError } = await this.db
      .from("dev_issue_attachments")
      .delete()
      .eq("id", id);
    if (delError) throw delError;
    // 実体の削除は best-effort(メタデータが消えていれば表示されない)
    await this.db.storage.from(ATTACHMENT_BUCKET).remove([data.storage_path]);
  }

  // --- 申込用URL ---

  async listApplicationLinks(): Promise<ApplicationLink[]> {
    const { data, error } = await this.db
      .from("application_links")
      .select("*, applications(count)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapApplicationLink);
  }

  async createApplicationLink(input: ApplicationLinkInput): Promise<ApplicationLink> {
    const days = input.expiryDays ?? 0;
    const { data, error } = await this.db
      .from("application_links")
      .insert({
        token: generateApplicationToken(),
        name: input.name.trim(),
        active: true,
        expires_at:
          days > 0
            ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
            : null,
        created_by: input.createdBy,
      })
      .select("*")
      .single();
    if (error) throw error;
    return mapApplicationLink(data);
  }

  async setApplicationLinkActive(id: string, active: boolean): Promise<ApplicationLink> {
    const { data, error } = await this.db
      .from("application_links")
      .update({ active })
      .eq("id", id)
      .select("*, applications(count)")
      .single();
    if (error) throw error;
    return mapApplicationLink(data);
  }

  async deleteApplicationLink(id: string): Promise<void> {
    // 受付済みの申込は残す(link_id は on delete set null。linkName は保持済み)
    const { error } = await this.db.from("application_links").delete().eq("id", id);
    if (error) throw error;
  }

  async getApplicationLinkByToken(
    token: string,
  ): Promise<{ link: ApplicationLink | null; state: ApplicationLinkState }> {
    if (!token) return { link: null, state: "not_found" };
    const { data, error } = await this.db
      .from("application_links")
      .select("*, applications(count)")
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { link: null, state: "not_found" };
    const link = mapApplicationLink(data);
    return { link, state: applicationLinkAvailability(link) };
  }

  // --- 申込 ---

  async listApplications(filter?: { status?: ApplicationStatus | "all" }): Promise<Application[]> {
    let q = this.db.from("applications").select("*").order("submitted_at", { ascending: false });
    if (filter?.status && filter.status !== "all") q = q.eq("status", filter.status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapApplicationMasked);
  }

  async getApplication(id: string): Promise<Application | null> {
    const { data, error } = await this.db
      .from("applications")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapApplicationMasked(data) : null;
  }

  async submitApplication(token: string, input: ApplicationInput): Promise<Application> {
    const { link, state } = await this.getApplicationLinkByToken(token);
    if (!link || state === "not_found") throw new Error("申込URLが見つかりません");
    if (state === "inactive") throw new Error("この申込URLは現在受付を停止しています");
    if (state === "expired") throw new Error("この申込URLは有効期限が切れています");

    // ID・パスワードは平文で保存しない(AES-256-GCM で暗号化した文字列を格納)
    const hpb = encryptCredential(input.hotpepper);
    const min = encryptCredential(input.minimo);
    const epk = encryptCredential(input.epark);
    const { data, error } = await this.db
      .from("applications")
      .insert({
        link_id: link.id,
        link_name: link.name,
        company_name: input.companyName.trim(),
        address: input.address.trim(),
        representative_title: input.representativeTitle.trim(),
        representative_name: input.representativeName.trim(),
        contact_name: input.contactName.trim(),
        phone: input.phone.trim(),
        email: input.email.trim(),
        hotpepper_login_id: hpb?.loginId ?? null,
        hotpepper_password: hpb?.password ?? null,
        minimo_login_id: min?.loginId ?? null,
        minimo_password: min?.password ?? null,
        epark_login_id: epk?.loginId ?? null,
        epark_password: epk?.password ?? null,
        line_requested: input.lineRequested,
        status: "submitted",
        submitted_ip: input.submittedIp ?? "",
      })
      .select("*")
      .single();
    if (error) throw error;
    const app = mapApplicationMasked(data);
    await this.logActivity({
      kind: "application_submitted",
      message: `申込フォームから「${app.companyName}」の申込がありました`,
      actor: app.companyName,
      amount: null,
      linkInvoiceId: null,
    });
    return app;
  }

  async revealApplicationCredentials(id: string): Promise<ApplicationCredentials | null> {
    const { data, error } = await this.db
      .from("applications")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      hotpepper: revealCredential(rawCredential(data, "hotpepper")),
      minimo: revealCredential(rawCredential(data, "minimo")),
      epark: revealCredential(rawCredential(data, "epark")),
    };
  }

  async updateApplicationStatus(id: string, status: ApplicationStatus): Promise<Application> {
    const { data, error } = await this.db
      .from("applications")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return mapApplicationMasked(data);
  }

  async createCustomerFromApplication(id: string, actor: string): Promise<Customer> {
    const app = await this.getApplication(id);
    if (!app) throw new Error("申込が見つかりません");
    if (app.customerId) throw new Error("この申込は既に顧客として登録されています");
    const customer = await this.createCustomer({
      name: app.companyName,
      contactName: app.contactName || app.representativeName,
      email: app.email,
      phone: app.phone,
      address: app.address,
      paymentMethod: "direct_debit",
      notes: applicationNotes(app),
      assignee: actor,
    });
    const { error } = await this.db
      .from("applications")
      .update({ customer_id: customer.id, status: "customer_created" })
      .eq("id", id);
    if (error) throw error;
    return customer;
  }

  // --- アプリ内通知 ---

  async listNotifications(
    userId: string,
    opts?: { unreadOnly?: boolean; limit?: number },
  ): Promise<AppNotification[]> {
    let q = this.db
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? 50);
    if (opts?.unreadOnly) q = q.eq("read", false);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapNotification);
  }

  async countUnreadNotifications(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) throw error;
    return count ?? 0;
  }

  async markNotificationsRead(userId: string, ids?: string[]): Promise<void> {
    let q = this.db.from("notifications").update({ read: true }).eq("user_id", userId);
    if (ids && ids.length > 0) q = q.in("id", ids);
    const { error } = await q;
    if (error) throw error;
  }

  // --- アカウント(プロフィール) ---

  async listUserProfiles(): Promise<UserProfile[]> {
    const { data, error } = await this.db
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    // メールアドレスは auth.users 側にあるため、サービスロール時のみ突き合わせる
    const emails = new Map<string, string>();
    try {
      const { data: usersData } = await this.db.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      for (const u of usersData?.users ?? []) emails.set(u.id, u.email ?? "");
    } catch {
      // RLS クライアント(サービスロール未設定)では取得できない — 空欄表示にとどめる
    }
    return (data ?? []).map((r: any) => mapProfile(r, emails.get(r.id) ?? ""));
  }

  async updateUserRole(userId: string, role: Role): Promise<void> {
    // プロフィール行が無いユーザー(トリガー導入前の作成など)でも成立するよう upsert。
    // full_name は指定しないため既存行の名前は保持される。
    const { error } = await this.db
      .from("profiles")
      .upsert({ id: userId, role }, { onConflict: "id" });
    if (error) throw error;
  }

  async createUserAccount(input: CreateAccountInput): Promise<UserProfile> {
    // Supabase Auth のユーザー作成はサービスロールが必須
    let created;
    try {
      created = await this.db.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { full_name: input.name, role: input.role },
      });
    } catch (e) {
      throw new Error(
        "アカウント作成には SUPABASE_SERVICE_ROLE_KEY の設定が必要です: " + (e as Error).message,
      );
    }
    if (created.error) throw new Error(created.error.message);
    const user = created.data.user;
    if (!user) throw new Error("アカウントの作成に失敗しました");
    // トリガー(handle_new_user)で profiles は作成されるが、確実に反映する
    const { data, error } = await this.db
      .from("profiles")
      .upsert({ id: user.id, full_name: input.name, role: input.role })
      .select("*")
      .single();
    if (error) throw error;
    return mapProfile(data, input.email);
  }

  async updateUserName(userId: string, name: string): Promise<void> {
    const { error } = await this.db
      .from("profiles")
      .update({ full_name: name })
      .eq("id", userId);
    if (error) throw error;
  }

  async updateAccountPassword(userId: string, password: string): Promise<void> {
    // Supabase Auth のパスワード変更はサービスロールが必須
    try {
      const { error } = await this.db.auth.admin.updateUserById(userId, { password });
      if (error) throw new Error(error.message);
    } catch (e) {
      throw new Error(
        "パスワードの変更に失敗しました(SUPABASE_SERVICE_ROLE_KEY の設定が必要です): " +
          (e as Error).message,
      );
    }
  }

  async deleteUserAccount(userId: string): Promise<void> {
    // Auth ユーザー削除 → profiles は on delete cascade で消える。
    // dev_issues.requester_id は set null になり、requester_name で履歴表示は残る。
    try {
      const { error } = await this.db.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
    } catch (e) {
      throw new Error(
        "アカウントの削除に失敗しました(SUPABASE_SERVICE_ROLE_KEY の設定が必要です): " +
          (e as Error).message,
      );
    }
    // 本人宛の通知を掃除(失敗しても削除自体は成立している)
    await this.db.from("notifications").delete().eq("user_id", userId);
  }

  /** 開発依頼イベントの通知を該当ユーザーへ配信(操作者本人は除外)。best-effort。 */
  private async notifyDevIssue(
    type: NotificationType,
    issue: DevIssue,
    message: string,
    actorId: string,
  ) {
    try {
      const { data: profRows, error } = await this.db.from("profiles").select("id, role");
      if (error) throw error;
      const recipients = devNotificationRecipients({
        type,
        profiles: (profRows ?? []).map((r: any) => ({ id: r.id, role: r.role as Role })),
        requesterId: issue.requesterId,
        actorId,
      }).filter(isUuid); // notifications.user_id は uuid のため
      if (recipients.length === 0) return;
      await this.db.from("notifications").insert(
        recipients.map((userId) => ({
          user_id: userId,
          type,
          message,
          issue_id: issue.id,
        })),
      );
    } catch {
      // 通知の失敗で本体の業務処理(依頼の登録・更新)を失敗させない
    }
  }
}

/** uuid 形式か(デモID等を uuid カラムへ入れないためのガード) */
function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
