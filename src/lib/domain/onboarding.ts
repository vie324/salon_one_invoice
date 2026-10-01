import { daysUntil } from "@/lib/utils";
import {
  effectiveStatus,
  outstandingAmount,
  subscriptionMonthly,
  withTax,
} from "./calculations";
import { AGENCY_DEAL_TYPES, type BadgeTone } from "./constants";
import type {
  AgencyDealType,
  Application,
  Contract,
  ContractStatus,
  Customer,
  CustomerOnboarding,
  DirectDebitMandate,
  Invoice,
  InvoiceStatus,
  MandateStatus,
  OnboardingChecklistItem,
  OnboardingStage,
  Plan,
  Subscription,
} from "./types";

/**
 * 受注管理(申込・契約 → 受注確認 → 導入準備 → 運用中)のドメインロジック。
 *
 * 標準の流れ:
 *   ① 申込・契約   お客様が「申込・契約URL」で申込内容を入力し、契約内容を確認して電子署名する
 *   ② 受注確認     請求管理者が内容を確認し「受注確定」= 初回請求書と毎月の請求(定期契約)を作る
 *   ③ 導入準備     3つを並行で進める
 *                  ・初回請求・入金   初期費用＋初月日割りの請求書を送り、お振込みを確認する
 *                  ・口座振替(NSS)    依頼書を郵送 → 回収 → NSSへ登録 → 登録完了
 *                  ・初期設定         連携情報の受領 → 初期設定 → 納品・利用開始のご案内
 *   ④ 運用中       毎月: 請求書の自動作成 → 確認期間 → NSSへ登録 → 引き落とし → 結果の反映
 *
 * ステージとチェックの多くは、契約・請求・入金・NSS の実データから自動で判定する。
 * 手で付けるのは「人が確認・作業したこと」だけ(MANUAL_CHECKLIST)。
 * こうしておくと、データとチェックが食い違って抜け漏れに気づけない、ということが起きない。
 */

/** 受注管理の列順(左→右) */
export const ONBOARDING_STAGES: OnboardingStage[] = [
  "application",
  "review",
  "setup",
  "operating",
  "closed",
];

/** 進行中のステージ(休止・解約・見送りを除く) */
export const ACTIVE_ONBOARDING_STAGES: OnboardingStage[] = [
  "application",
  "review",
  "setup",
  "operating",
];

export const onboardingStageLabels: Record<OnboardingStage, string> = {
  application: "申込・契約",
  review: "受注確認",
  setup: "導入準備",
  operating: "運用中",
  closed: "休止・解約・見送り",
};

export const onboardingStageDescriptions: Record<OnboardingStage, string> = {
  application: "お客様の申込・電子署名を待っています",
  review: "締結済み。請求管理者が内容を確認して受注を確定します",
  setup: "初回請求・入金／口座振替（NSS）／初期設定を並行で進めます",
  operating: "導入準備がすべて完了。毎月の請求・引き落としの運用中です",
  closed: "休止・解約・見送りにした案件",
};

export const onboardingStageTone: Record<OnboardingStage, BadgeTone> = {
  application: "info",
  review: "danger",
  setup: "warning",
  operating: "success",
  closed: "neutral",
};

/** 各ステージで主に手を動かす人 */
export const onboardingStageOwner: Record<OnboardingStage, string> = {
  application: "お客様（営業・代理店がご案内）",
  review: "請求管理者",
  setup: "請求管理者・導入担当",
  operating: "請求管理者（毎月）",
  closed: "—",
};

/** 旧ステージ(移行前のデータ)を新ステージへ読み替える */
export function normalizeStage(stage: string | null | undefined): OnboardingStage {
  switch (stage) {
    case "application":
    case "review":
    case "setup":
    case "operating":
    case "closed":
      return stage;
    case "contract":
      return "application";
    case "initial_billing":
    case "debit_setup":
    case "initial_payment":
      return "setup";
    default:
      return "application";
  }
}

/* ---------------------------------------------------------------------------
 * 担当
 * ------------------------------------------------------------------------- */

/** 項目の担当(誰の手番か) */
export type OrderOwner = "customer" | "billing" | "setup" | "agency" | "nss";

export const orderOwnerLabels: Record<OrderOwner, string> = {
  customer: "お客様",
  billing: "請求管理者",
  setup: "導入担当",
  agency: "代理店",
  nss: "NSS",
};

export const orderOwnerTone: Record<OrderOwner, BadgeTone> = {
  customer: "info",
  billing: "primary",
  setup: "warning",
  agency: "warning",
  nss: "neutral",
};

/* ---------------------------------------------------------------------------
 * 手で付けるチェック(保存する項目)
 * ------------------------------------------------------------------------- */

/**
 * 手で付けるチェック項目。key は保存済みデータと突き合わせるので変えないこと。
 * 実データから判定できる項目(締結・受注確定・入金・NSS の各手続き)はここに入れない。
 */
export const MANUAL_CHECKLIST: { key: ManualChecklistKey; label: string }[] = [
  { key: "review_checked", label: "申込内容を確認（会社情報・プラン・金額・代理店／紹介）" },
  { key: "initial_invoice_sent", label: "初回請求書をお客様へ送付" },
  { key: "setup_info", label: "連携に必要な情報（ID・PASS 等）がそろっている" },
  { key: "setup_done", label: "システムの初期設定（クライアント専用環境の構築・データ入力）" },
  { key: "setup_delivered", label: "納品・利用開始のご案内をお客様へ送付" },
];

export type ManualChecklistKey =
  | "review_checked"
  | "initial_invoice_sent"
  | "setup_info"
  | "setup_done"
  | "setup_delivered";

/** 旧チェックリスト(移行前)の key → 新しい key */
const LEGACY_CHECKLIST_KEYS: Record<string, ManualChecklistKey> = {
  app_confirm: "review_checked",
  app_plan: "review_checked",
  ib_send: "initial_invoice_sent",
};

/** 新規案件用のチェックリスト(全項目・未完了) */
export function defaultChecklist(): OnboardingChecklistItem[] {
  return MANUAL_CHECKLIST.map((c) => ({
    key: c.key,
    label: c.label,
    done: false,
    doneAt: null,
    doneBy: "",
  }));
}

/**
 * 保存済みチェックリストを標準項目とマージする。
 * 項目の追加・文言変更を既存の案件へ反映しつつ、チェック状態は引き継ぐ
 * (旧チェックリストの key も読み替えて引き継ぐ)。
 */
export function mergeChecklist(
  stored: Partial<OnboardingChecklistItem>[] | null | undefined,
): OnboardingChecklistItem[] {
  const byKey = new Map<string, Partial<OnboardingChecklistItem>>();
  for (const s of stored ?? []) {
    if (!s?.key) continue;
    const key = LEGACY_CHECKLIST_KEYS[s.key] ?? s.key;
    // 新旧どちらかが完了していれば完了として引き継ぐ
    const prev = byKey.get(key);
    if (!prev || (!prev.done && s.done)) byKey.set(key, s);
  }
  return MANUAL_CHECKLIST.map((c) => {
    const s = byKey.get(c.key);
    return {
      key: c.key,
      label: c.label,
      done: s?.done ?? false,
      doneAt: s?.doneAt ?? null,
      doneBy: s?.doneBy ?? "",
    };
  });
}

/* ---------------------------------------------------------------------------
 * 進み具合の判定
 * ------------------------------------------------------------------------- */

type InvoiceLike = Pick<
  Invoice,
  "id" | "type" | "status" | "issueDate" | "dueDate" | "total" | "amountPaid" | "createdAt" | "paidAt"
>;

type ContractLike = Pick<
  Contract,
  | "id"
  | "contractNumber"
  | "status"
  | "signedAt"
  | "sentAt"
  | "expiresAt"
  | "createdAt"
  | "linkedSubscriptionId"
  | "linkedInvoiceId"
  | "terms"
>;

type SubscriptionLike = Pick<
  Subscription,
  "status" | "planId" | "optionKeys" | "priceOverride" | "storeCount" | "startedOn"
>;

export interface OrderProgressInput {
  customer: Pick<Customer, "id" | "status" | "paymentMethod" | "createdAt">;
  /** 案件カード(手で付けたチェック・休止フラグ)。未作成なら null */
  card?: Pick<CustomerOnboarding, "stage" | "checklist"> | null;
  /** この顧客の申込(申込・契約URLから届いたもの)。無ければ null */
  application?: Pick<
    Application,
    "id" | "submittedAt" | "hotpepper" | "minimo" | "epark" | "lineRequested"
  > | null;
  /** この顧客の契約書 */
  contracts: ContractLike[];
  /** この顧客の請求書 */
  invoices: InvoiceLike[];
  /** この顧客の定期契約 */
  subscriptions: SubscriptionLike[];
  plans: Pick<Plan, "id" | "taxRate" | "amount" | "options">[];
  mandate: (Partial<DirectDebitMandate> & Pick<DirectDebitMandate, "status">) | null;
  /** 代理店の区分(初期設定を代理店が行うかの判定に使う) */
  agencyDealType?: AgencyDealType | null;
  /** NSS で一度でも引き落としに成功しているか */
  firstDebitSucceeded?: boolean;
  now?: Date;
}

/** チェックリストの1行(表示用。自動判定・手動チェックの両方) */
export interface OrderStepItem {
  key: string;
  label: string;
  owner: OrderOwner;
  /** auto = 実データから判定 / manual = チェックで完了 / nss = 口座振替の手続き(日付を記録) */
  mode: "auto" | "manual" | "nss";
  done: boolean;
  doneAt: string | null;
  doneBy: string;
  /** この案件では不要 */
  skipped: boolean;
  /** 前の手続きが終わるまで着手できない */
  blocked: boolean;
  /** お客様・NSS の手番(こちらは待つだけ) */
  waiting: boolean;
  /** 進み具合に数えない参考項目 */
  optional: boolean;
  /** 補足(不足しているもの・金額・期日など) */
  hint: string;
  /** 遅れている(期限超過・長期の停滞) */
  late: boolean;
}

export type OrderTrackKey = "apply" | "review" | "billing" | "nss" | "setup";

export interface OrderTrack {
  key: OrderTrackKey;
  label: string;
  /** このトラックが属するステージ */
  stage: OnboardingStage;
  items: OrderStepItem[];
}

export const orderTrackLabels: Record<OrderTrackKey, string> = {
  apply: "① 申込・契約",
  review: "② 受注確認",
  billing: "③ 初回請求・入金",
  nss: "③ 口座振替（NSS）",
  setup: "③ 初期設定・導入",
};

/** 実データから導出した状態(案件カードに表示するシグナル) */
export interface OrderProgress {
  /** 実データから決まるステージ */
  stage: OnboardingStage;
  tracks: OrderTrack[];
  /** こちら(当社側)が次にやること。無ければ待ちの項目、それも無ければ null */
  next: OrderStepItem | null;
  /** 未完了の項目(着手できるもの。待ちの項目を含む) */
  open: OrderStepItem[];
  /** 進み具合(必須項目のうち完了した数 / 必須項目の数) */
  doneCount: number;
  totalCount: number;
  /* ---- シグナル ---- */
  signed: boolean;
  billingStarted: boolean;
  /** 代表の契約書(締結済み > 署名待ち > 下書き の順) */
  contractId: string | null;
  contractNumber: string | null;
  contractStatus: ContractStatus | null;
  /** 初回請求書(type=initial の最新・取消を除く) */
  initialInvoiceId: string | null;
  initialInvoiceStatus: InvoiceStatus | null;
  initialInvoiceTotal: number;
  initialPaid: boolean;
  mandateStatus: MandateStatus | null;
  needsMandate: boolean;
  subscriptionActive: boolean;
  /** 現在の月額(税込・全店舗)。定期契約が無ければ 0 */
  monthlyFee: number;
  /** 未収金(この顧客の全請求) */
  outstanding: number;
  /** 期限超過・引落失敗の件数 */
  overdueCount: number;
  /** 初期設定を代理店が行うか */
  agencyDoesSetup: boolean;
}

/** 締結済み > 署名待ち(閲覧済) > 下書き > 期限切れ・辞退・取消 の順に代表を選ぶ */
const CONTRACT_PROGRESS: ContractStatus[] = [
  "canceled",
  "declined",
  "expired",
  "draft",
  "sent",
  "viewed",
  "signed",
];

/** 口座振替依頼書の回収を待つ目安(これを超えたら電話等で確認) */
const NSS_FORM_WAIT_DAYS = 14;

function isoOrNull(v: string | null | undefined): string | null {
  return v ? v : null;
}

function credentialProvided(c: { loginId?: string; password?: string } | null | undefined) {
  return Boolean(c && (c.loginId || c.password));
}

export function computeOrderProgress(input: OrderProgressInput): OrderProgress {
  const now = input.now ?? new Date();
  const invoices = input.invoices.map((i) => ({
    ...i,
    status: effectiveStatus(i, now),
  }));
  const contracts = input.contracts;
  const subscriptions = input.subscriptions;
  const checklist = mergeChecklist(input.card?.checklist);
  const manual = new Map(checklist.map((c) => [c.key, c]));
  const dealRule = input.agencyDealType ? AGENCY_DEAL_TYPES[input.agencyDealType] : null;
  const agencyDoesSetup = Boolean(dealRule?.agencyDoesSetup);
  const setupOwner: OrderOwner = agencyDoesSetup ? "agency" : "setup";

  /* ---- 契約 ---- */
  const ranked = [...contracts].sort((a, b) => {
    const d = CONTRACT_PROGRESS.indexOf(a.status) - CONTRACT_PROGRESS.indexOf(b.status);
    if (d !== 0) return d;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });
  const contract = ranked[ranked.length - 1] ?? null;
  const signedContract = contracts.find((c) => c.status === "signed") ?? null;
  const signed = signedContract != null;

  /* ---- 請求 ---- */
  const initialInvoices = invoices
    .filter((i) => i.type === "initial" && i.status !== "canceled")
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  const initialInvoice = initialInvoices[initialInvoices.length - 1] ?? null;
  const initialPaid = initialInvoice != null && initialInvoice.status === "paid";

  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const subscriptionActive = activeSubs.length > 0;
  const billingStarted =
    contracts.some((c) => !!c.linkedSubscriptionId || !!c.linkedInvoiceId) ||
    subscriptionActive ||
    initialInvoice != null;

  const monthlyFee = activeSubs.reduce((sum, sub) => {
    const plan = input.plans.find((p) => p.id === sub.planId);
    if (!plan) return sum;
    return (
      sum +
      withTax(
        subscriptionMonthly(plan, sub.optionKeys ?? [], sub.priceOverride, sub.storeCount ?? 1),
        plan.taxRate,
      )
    );
  }, 0);

  const unpaid = invoices.filter((i) =>
    ["sent", "awaiting_payment", "partially_paid", "overdue", "failed"].includes(i.status),
  );
  const outstanding = unpaid.reduce((s, i) => s + outstandingAmount(i), 0);
  const overdueCount = invoices.filter(
    (i) => i.status === "overdue" || i.status === "failed",
  ).length;

  /* ---- NSS ---- */
  const mandate = input.mandate;
  const mandateStatus = mandate?.status ?? null;
  const needsMandate = input.customer.paymentMethod === "direct_debit";
  const nssActive = mandateStatus === "active";
  const nssFailed = mandateStatus === "failed";

  const closed =
    normalizeStage(input.card?.stage) === "closed" ||
    input.customer.status === "inactive" ||
    (subscriptions.length > 0 && subscriptions.every((s) => s.status === "canceled"));

  const mk = (
    partial: Pick<OrderStepItem, "key" | "label" | "owner" | "mode"> & Partial<OrderStepItem>,
  ): OrderStepItem => ({
    done: false,
    doneAt: null,
    doneBy: "",
    skipped: false,
    blocked: false,
    waiting: false,
    optional: false,
    hint: "",
    late: false,
    ...partial,
  });

  const manualItem = (
    key: ManualChecklistKey,
    owner: OrderOwner,
    extra: Partial<OrderStepItem> = {},
  ): OrderStepItem => {
    const m = manual.get(key)!;
    return mk({
      key,
      label: m.label,
      owner,
      mode: "manual",
      done: m.done,
      doneAt: m.doneAt,
      doneBy: m.doneBy,
      ...extra,
      // 完了済みなら blocked/waiting は意味を持たない
      ...(m.done ? { blocked: false, waiting: false } : {}),
    });
  };

  /* ---- ① 申込・契約 ---- */
  let contractHint = "";
  let contractOwner: OrderOwner = "customer";
  let contractWaiting = false;
  if (!signed) {
    if (!contract) {
      contractHint = "契約書がまだありません。契約書を作成してお客様へ送ってください。";
      contractOwner = "billing";
    } else if (contract.status === "draft") {
      contractHint = `契約書 ${contract.contractNumber} が下書きのままです。お客様へ送付してください。`;
      contractOwner = "billing";
    } else if (contract.status === "sent" || contract.status === "viewed") {
      const expired =
        contract.expiresAt && new Date(contract.expiresAt).getTime() < now.getTime();
      if (expired) {
        contractHint = "署名期限が切れました。契約書を再送してください。";
        contractOwner = "billing";
      } else {
        contractHint =
          contract.status === "viewed"
            ? "お客様が契約書を閲覧済み。署名をお待ちしています。"
            : "お客様の署名待ちです（必要ならリマインドを送ってください）。";
        contractWaiting = true;
      }
    } else if (contract.status === "declined") {
      contractHint = "お客様が締結を辞退しました。内容を確認し、必要なら契約書を作り直してください。";
      contractOwner = "billing";
    } else {
      contractHint = "有効な契約書がありません。契約書を作成してお客様へ送ってください。";
      contractOwner = "billing";
    }
  }

  const apply: OrderTrack = {
    key: "apply",
    label: orderTrackLabels.apply,
    stage: "application",
    items: [
      mk({
        key: "apply_received",
        label: "申込を受付",
        owner: "customer",
        mode: "auto",
        done: true,
        doneAt: input.application?.submittedAt ?? input.customer.createdAt ?? null,
        hint: input.application ? "申込・契約URLから受付" : "顧客を手動で登録",
      }),
      mk({
        key: "contract_signed",
        label: "契約を締結（電子署名・書面）",
        owner: contractOwner,
        mode: "auto",
        done: signed,
        doneAt: isoOrNull(signedContract?.signedAt),
        waiting: contractWaiting,
        hint: signed
          ? `契約書 ${signedContract!.contractNumber}`
          : billingStarted
            ? "契約書が締結されていないまま請求が始まっています。書面で締結済みなら「書面締結を登録」で記録してください。"
            : contractHint,
        late: !signed && billingStarted,
      }),
    ],
  };

  /* ---- ② 受注確認 ---- */
  const review: OrderTrack = {
    key: "review",
    label: orderTrackLabels.review,
    stage: "review",
    items: [
      manualItem("review_checked", "billing", {
        // 受注確定まで済んでいれば確認済みとみなす
        ...(billingStarted && !manual.get("review_checked")!.done
          ? { done: true, mode: "auto" as const, doneBy: "受注確定時に確認" }
          : {}),
        blocked: !signed && !billingStarted,
        hint: "会社名・住所・代表者・連絡先、プランと金額、代理店／紹介の紐付け、重複申込がないかを確認",
      }),
      mk({
        key: "order_confirmed",
        label: "受注を確定（初回請求書・毎月の請求を作成）",
        owner: "billing",
        mode: "auto",
        done: billingStarted,
        doneAt: isoOrNull(initialInvoice?.createdAt ?? activeSubs[0]?.startedOn),
        blocked: !signed && !billingStarted,
        hint: billingStarted
          ? ""
          : signed
            ? "受注管理の案件ページ、または契約書の画面から「受注を確定」してください。"
            : "契約の締結後に確定できます。",
      }),
    ],
  };

  /* ---- ③ 初回請求・入金 ---- */
  const noInitial = billingStarted && initialInvoice == null;
  const initialOverdueDays =
    initialInvoice && !initialPaid ? -daysUntil(initialInvoice.dueDate, now) : 0;
  const billing: OrderTrack = {
    key: "billing",
    label: orderTrackLabels.billing,
    stage: "setup",
    items: [
      manualItem("initial_invoice_sent", "billing", {
        // 送付の記録がなくても、入金済みなら送付は済んでいる(対応待ちに残さない)
        ...(initialPaid && !manual.get("initial_invoice_sent")!.done
          ? {
              done: true,
              mode: "auto" as const,
              doneAt: isoOrNull(initialInvoice?.paidAt),
              doneBy: "入金済みのため完了",
            }
          : {}),
        blocked: !billingStarted,
        skipped: noInitial,
        hint: noInitial
          ? "初回請求書はありません（初期費用・初月日割りなし）"
          : initialInvoice
            ? "「メールで送付」で送るか、郵送・手渡しした場合は「完了にする」を押してください（入金を確認すると自動で完了します）。"
            : "受注確定で作成されます。",
      }),
      mk({
        key: "initial_paid",
        label: "初回のお振込みを確認（入金の消し込み）",
        owner: initialOverdueDays > 0 ? "billing" : "customer",
        mode: "auto",
        done: initialPaid,
        doneAt: isoOrNull(initialInvoice?.paidAt),
        blocked: !billingStarted,
        skipped: noInitial,
        waiting: !initialPaid && initialInvoice != null && initialOverdueDays <= 0,
        late: initialOverdueDays > 0,
        hint: noInitial
          ? "初回請求書はありません"
          : initialPaid
            ? ""
            : initialInvoice
              ? initialOverdueDays > 0
                ? `支払期限を${initialOverdueDays}日過ぎています。入金確認（銀行明細の取込）と督促を行ってください。`
                : `支払期限 ${initialInvoice.dueDate.replace(/-/g, "/")}。入金されたら「入金確認」で消し込みます。`
              : "受注確定で初回請求書が作成されます。",
      }),
    ],
  };

  /* ---- ③ 口座振替(NSS) ---- */
  const formSent = Boolean(mandate?.formSentOn);
  const formReceived = Boolean(mandate?.formReceivedOn);
  const nssSubmitted = Boolean(mandate?.nssSubmittedOn);
  const nssBlocked = !signed && !billingStarted;
  const formWaitDays = mandate?.formSentOn && !formReceived ? -daysUntil(mandate.formSentOn, now) : 0;
  const nss: OrderTrack = {
    key: "nss",
    label: orderTrackLabels.nss,
    stage: "setup",
    items: [
      mk({
        key: "nss_form_sent",
        label: "口座振替依頼書をお客様へ郵送",
        owner: "billing",
        mode: "nss",
        done: formSent || formReceived || nssSubmitted || nssActive,
        doneAt: isoOrNull(mandate?.formSentOn),
        blocked: nssBlocked,
        skipped: !needsMandate,
        hint: needsMandate ? "登録住所あてに郵送します（契約締結後すぐに送れます）" : "口座振替の対象外（振込などのお客様）",
      }),
      mk({
        key: "nss_form_received",
        label: "記入済みの依頼書を回収（原本は本部で保管）",
        owner: "customer",
        mode: "nss",
        done: formReceived || nssSubmitted || nssActive,
        doneAt: isoOrNull(mandate?.formReceivedOn),
        blocked: nssBlocked || !formSent,
        skipped: !needsMandate,
        waiting: formSent && !formReceived,
        late: formWaitDays > NSS_FORM_WAIT_DAYS,
        hint:
          formSent && !formReceived
            ? formWaitDays > NSS_FORM_WAIT_DAYS
              ? `郵送から${formWaitDays}日たっています。お客様へ返送の状況を確認してください。`
              : `郵送から${formWaitDays}日。お客様からの返送待ちです。`
            : "",
      }),
      mk({
        key: "nss_submitted",
        label: "依頼書を NSS へ送付し、収納サイトで登録",
        owner: "billing",
        mode: "nss",
        // NSS から不備で戻ってきたら、再提出するまで未完了に戻す(対応待ちに出す)
        done: (nssSubmitted && !nssFailed) || nssActive,
        doneAt: nssFailed ? null : isoOrNull(mandate?.nssSubmittedOn),
        blocked: nssBlocked || !formReceived,
        skipped: !needsMandate,
        late: nssFailed,
        hint: nssFailed
          ? `NSS から不備の連絡あり。お客様に再記入をお願いし、再提出してください。${mandate?.note ? `（${mandate.note}）` : ""}`
          : "口座番号等は NSS 側で自動で取り込まれます。名義人などの確認・入力を行います。",
      }),
      mk({
        key: "nss_active",
        label: "NSS の登録完了を確認（振替開始月）",
        owner: "nss",
        mode: "nss",
        done: nssActive,
        doneAt: isoOrNull(mandate?.registeredAt),
        blocked: nssBlocked || !nssSubmitted || nssFailed,
        skipped: !needsMandate,
        waiting: nssSubmitted && !nssActive && !nssFailed,
        hint: nssActive
          ? mandate?.debitStartMonth
            ? `${mandate.debitStartMonth.replace("-", "年")}月分から引き落とし`
            : "振替開始月を記録しておくと、それまでの月の請求を振込に切り替え忘れません。"
          : nssSubmitted
            ? "NSS の登録完了待ち。登録が終わるまでの月の請求は「振込」でお願いします。"
            : "",
      }),
      mk({
        key: "nss_first_debit",
        label: "初回の引き落とし結果を確認",
        owner: "billing",
        mode: "auto",
        done: Boolean(input.firstDebitSucceeded),
        blocked: !nssActive,
        skipped: !needsMandate,
        optional: true,
        hint: "NSS引き落としの画面で結果を反映すると自動で付きます。",
      }),
    ],
  };

  /* ---- ③ 初期設定・導入 ---- */
  const app = input.application;
  const providedServices = [
    credentialProvided(app?.hotpepper) ? "HPB" : null,
    credentialProvided(app?.minimo) ? "minimo" : null,
    credentialProvided(app?.epark) ? "EPARK" : null,
    app?.lineRequested ? "LINE連携の希望あり" : null,
  ].filter(Boolean) as string[];
  const contractOptions = signedContract?.terms?.optionKeys ?? contract?.terms?.optionKeys ?? [];
  const needsInfo = contractOptions.length > 0 || providedServices.length > 0;
  const setupBlocked = !billingStarted;
  const setup: OrderTrack = {
    key: "setup",
    label: orderTrackLabels.setup,
    stage: "setup",
    items: [
      manualItem("setup_info", setupOwner, {
        blocked: setupBlocked,
        skipped: !needsInfo,
        hint: needsInfo
          ? providedServices.length
            ? `申込で受領: ${providedServices.join(" / ")}`
            : "申込では連携情報が未入力です。お客様に確認してください。"
          : "外部サービス連携なし",
      }),
      manualItem("setup_done", setupOwner, {
        blocked: setupBlocked,
        hint: agencyDoesSetup
          ? "営業・初期設定型の代理店が担当します。完了の連絡を受けたらチェックしてください。"
          : "初期入力シートと照合しながらクライアント専用環境を構築します。",
      }),
      manualItem("setup_delivered", setupOwner, {
        blocked: setupBlocked,
        hint: "納品のお知らせを送り、シフト設定などをお客様に進めていただきます。",
      }),
    ],
  };

  const tracks = [apply, review, billing, nss, setup];

  /* ---- ステージ ---- */
  const required = (t: OrderTrack) => t.items.filter((i) => !i.skipped && !i.optional);
  const setupDone = [billing, nss, setup].every((t) => required(t).every((i) => i.done));
  let stage: OnboardingStage;
  if (closed) stage = "closed";
  else if (!billingStarted) stage = signed ? "review" : "application";
  else if (setupDone) stage = "operating";
  else stage = "setup";

  /* ---- 次にやること ---- */
  const all = tracks.flatMap((t) => t.items);
  const open = all.filter((i) => !i.done && !i.skipped && !i.optional && !i.blocked);
  const actionable = open.filter((i) => !i.waiting);
  const next = closed ? null : (actionable[0] ?? open[0] ?? null);
  const counted = all.filter((i) => !i.skipped && !i.optional);

  return {
    stage,
    tracks,
    next,
    open,
    doneCount: counted.filter((i) => i.done).length,
    totalCount: counted.length,
    signed,
    billingStarted,
    contractId: contract?.id ?? null,
    contractNumber: contract?.contractNumber ?? null,
    contractStatus: contract?.status ?? null,
    initialInvoiceId: initialInvoice?.id ?? null,
    initialInvoiceStatus: initialInvoice?.status ?? null,
    initialInvoiceTotal: initialInvoice?.total ?? 0,
    initialPaid,
    mandateStatus,
    needsMandate,
    subscriptionActive,
    monthlyFee,
    outstanding,
    overdueCount,
    agencyDoesSetup,
  };
}

/** 新規案件の初期ステージ(実データから推定) */
export function initialStageFor(input: OrderProgressInput): OnboardingStage {
  return computeOrderProgress(input).stage;
}

/** フォロー期日が超過しているか */
export function onboardingDueOver(dueDate: string | null, now = new Date()): boolean {
  return !!dueDate && daysUntil(dueDate, now) < 0;
}

/* ---------------------------------------------------------------------------
 * 受注管理の「対応待ち」一覧(案件をまたいで、やることごとにまとめる)
 * ------------------------------------------------------------------------- */

/** 対応待ちの分類(画面の見出し)。並び順 = 対応の優先順。 */
export const ORDER_TASK_GROUPS: {
  key: string;
  label: string;
  /** どの項目をこの分類に入れるか */
  itemKeys: string[];
  owner: OrderOwner;
  /** お客様・NSS 待ち(こちらは様子を見るだけ) */
  waiting?: boolean;
  description: string;
}[] = [
  {
    key: "review",
    label: "受注確認・受注確定",
    itemKeys: ["review_checked", "order_confirmed"],
    owner: "billing",
    description: "締結済みの申込を確認して、受注を確定します（初回請求書と毎月の請求が作られます）",
  },
  {
    key: "contract",
    label: "契約書の作成・送付",
    itemKeys: ["contract_signed"],
    owner: "billing",
    description: "契約書が無い・下書きのまま・期限切れの案件です",
  },
  {
    key: "initial_invoice",
    label: "初回請求書の送付",
    itemKeys: ["initial_invoice_sent"],
    owner: "billing",
    description: "初期費用＋初月日割りの請求書をお客様へ送ります",
  },
  {
    key: "initial_overdue",
    label: "初回入金の督促（期限超過）",
    itemKeys: ["initial_paid"],
    owner: "billing",
    description: "支払期限を過ぎた初回請求です。入金確認と督促を行います",
  },
  {
    key: "nss_send",
    label: "口座振替依頼書の郵送",
    itemKeys: ["nss_form_sent"],
    owner: "billing",
    description: "NSS の口座振替依頼書をお客様へ郵送します",
  },
  {
    key: "nss_submit",
    label: "NSS への登録（不備の再提出を含む）",
    itemKeys: ["nss_submitted"],
    owner: "billing",
    description: "回収した依頼書を NSS へ送り、収納サイトで登録します",
  },
  {
    key: "setup",
    label: "初期設定・納品",
    itemKeys: ["setup_info", "setup_done", "setup_delivered"],
    owner: "setup",
    description: "連携情報の受領・初期設定・納品のご案内（営業・初期設定型の代理店案件は代理店が担当）",
  },
  {
    key: "wait_sign",
    label: "お客様の署名待ち",
    itemKeys: ["contract_signed"],
    owner: "customer",
    waiting: true,
    description: "契約書を送付済み。必要ならリマインドを送ります",
  },
  {
    key: "wait_form",
    label: "依頼書の返送待ち",
    itemKeys: ["nss_form_received"],
    owner: "customer",
    waiting: true,
    description: "口座振替依頼書の返送を待っています（2週間を超えたら確認の連絡を）",
  },
  {
    key: "wait_payment",
    label: "初回入金待ち",
    itemKeys: ["initial_paid"],
    owner: "customer",
    waiting: true,
    description: "支払期限前の初回請求です",
  },
  {
    key: "wait_nss",
    label: "NSS の登録完了待ち",
    itemKeys: ["nss_active"],
    owner: "nss",
    waiting: true,
    description: "NSS の登録完了を待っています。完了したら振替開始月を記録します",
  },
];

/** 項目が対応待ちのどの分類に入るか(入らなければ null) */
export function taskGroupFor(item: OrderStepItem): string | null {
  for (const g of ORDER_TASK_GROUPS) {
    if (!g.itemKeys.includes(item.key)) continue;
    if (Boolean(g.waiting) !== item.waiting) continue;
    return g.key;
  }
  return null;
}
