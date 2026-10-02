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
  LegacyOnboardingProgress,
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
 *
 * ct_signed / ib_issue / ip_check は旧「顧客ステータス」と同じ key にしてある。
 * 旧画面で付けていたチェック(締結を確認・初回請求書を発行・初回振込の入金を確認)は、
 * システムに契約書・請求書が無いお客様の「システムの外で済ませた記録」としてそのまま引き継がれる。
 */
export const MANUAL_CHECKLIST: { key: ManualChecklistKey; label: string }[] = [
  { key: "review_checked", label: "申込内容を確認（会社情報・プラン・金額・代理店／紹介）" },
  { key: "ct_signed", label: "契約は書面・旧運用など、システムの外で締結済み" },
  { key: "initial_invoice_sent", label: "初回請求書をお客様へ送付" },
  { key: "ib_issue", label: "初回請求書はシステムの外で発行済み（スプレッドシート・紙など）" },
  { key: "ib_none", label: "初回請求なし（初期費用・初月日割りなし）" },
  { key: "ip_check", label: "初回の入金を確認済み（システムの外で発行した請求書）" },
  { key: "sub_none", label: "毎月の請求はこのシステムで行わない（スポット契約・システムの外で請求）" },
  { key: "setup_info", label: "連携に必要な情報（ID・PASS 等）がそろっている" },
  { key: "setup_done", label: "システムの初期設定（クライアント専用環境の構築・データ入力）" },
  { key: "setup_delivered", label: "納品・利用開始のご案内をお客様へ送付" },
];

export type ManualChecklistKey =
  | "review_checked"
  | "ct_signed"
  | "initial_invoice_sent"
  | "ib_issue"
  | "ib_none"
  | "ip_check"
  | "sub_none"
  | "setup_info"
  | "setup_done"
  | "setup_delivered";

/** 旧チェックリスト(移行前)の key → 新しい key */
const LEGACY_CHECKLIST_KEYS: Record<string, ManualChecklistKey> = {
  app_confirm: "review_checked",
  app_plan: "review_checked",
  ib_send: "initial_invoice_sent",
};

/** 旧「顧客ステータス」だけにあった key(これが残っていれば旧画面で作った案件) */
const LEGACY_ONLY_KEYS = [
  "app_confirm",
  "app_plan",
  "ct_send",
  "ib_send",
  "dd_send",
  "dd_receive",
  "dd_register",
  "op_first",
];

/** 受注管理が実データからステージを付け直したときの記録者名 */
export const AUTO_STAGE_ACTOR = "自動（実データから判定）";

/** 旧「顧客ステータス」から引き継いだ項目の記録者名(表示用) */
export const LEGACY_ACTOR = "旧「顧客ステータス」から引き継ぎ";

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
    const prev = byKey.get(key);
    // 受注管理で付け外しした記録を最優先する。それ以外は、新旧どちらかが完了していれば完了として引き継ぐ
    if (!prev) byKey.set(key, s);
    else if (!prev.updatedAt && (s.updatedAt || (!prev.done && s.done))) byKey.set(key, s);
  }
  return MANUAL_CHECKLIST.map((c) => {
    const s = byKey.get(c.key);
    return {
      key: c.key,
      label: c.label,
      done: s?.done ?? false,
      doneAt: s?.doneAt ?? null,
      doneBy: s?.doneBy ?? "",
      updatedAt: s?.updatedAt ?? null,
    };
  });
}

/**
 * チェックの付け外しを保存用のチェックリストに反映する(デモ・本番で共通)。
 * 旧「顧客ステータス」の項目は消さずに残す(旧画面からの引き継ぎの判定に使うため)。
 */
export function applyChecklistToggles(
  stored: Partial<OnboardingChecklistItem>[] | null | undefined,
  toggles: { key: string; done: boolean }[],
  actor: string,
  nowIso: string,
): OnboardingChecklistItem[] {
  const merged = mergeChecklist(stored);
  for (const t of toggles) {
    const item = merged.find((c) => c.key === t.key);
    if (!item) continue;
    if (item.done !== t.done) {
      item.done = t.done;
      item.doneAt = t.done ? nowIso : null;
      item.doneBy = t.done ? actor : "";
    }
    // 受注管理で明示的に決めた(旧画面からの引き継ぎより優先する)
    item.updatedAt = nowIso;
  }
  const known = new Set(merged.map((c) => c.key));
  const legacyRest = (stored ?? []).filter((s) => s?.key && !known.has(s.key)) as OnboardingChecklistItem[];
  return [...merged, ...legacyRest];
}

/* ---------------------------------------------------------------------------
 * 旧「顧客ステータス」(移行前のカンバン)からの引き継ぎ
 * ------------------------------------------------------------------------- */

/** 旧画面のステージ名 → 表示名と進み具合(0=申込 … 5=運用中) */
const LEGACY_STAGES: Record<string, { label: string; rank: number }> = {
  application: { label: "申込", rank: 0 },
  contract: { label: "契約", rank: 1 },
  initial_billing: { label: "初回請求", rank: 2 },
  // 移行後の画面が読み替えて保存し直したもの(初回請求・振替手続き・入金チェックのどれか)
  setup: { label: "初回請求〜入金チェック", rank: 2 },
  debit_setup: { label: "振替手続き", rank: 3 },
  initial_payment: { label: "入金チェック", rank: 4 },
  operating: { label: "運用中", rank: 5 },
};

/** 旧画面だけにあったステージ名(読み替え前の名前が残っていれば、旧画面での記録) */
const LEGACY_ONLY_STAGES = new Set(["contract", "initial_billing", "debit_setup", "initial_payment"]);

/**
 * 保存されているチェックリストとステージ履歴(読み替え前)から、旧画面での進み具合を読み取る。
 *
 * 旧画面ではカードを手で動かして進めていたため、システムに契約書・初回請求書が無いまま
 * 「初回請求」「入金チェック」などに進めていたお客様がいる。受注管理は実データからステージを
 * 決めるので、そのままだと最初(申込・契約)に戻ってしまう。最後に置いていたステージから
 *   初回請求以降 → 契約は済んでいた / 振替手続き以降 → 初回請求書の発行・送付も済んでいた /
 *   運用中 → 初回入金の確認も済んでいた
 * として引き継ぐ(受注管理で付け外ししたチェックはそちらを優先する)。
 */
export function legacyProgressFrom(rawChecklist: unknown, rawHistory: unknown): LegacyOnboardingProgress | null {
  const checklist = Array.isArray(rawChecklist) ? (rawChecklist as { key?: unknown }[]) : [];
  const history = Array.isArray(rawHistory) ? (rawHistory as { stage?: unknown; by?: unknown }[]) : [];
  const hasLegacyKeys = checklist.some((c) => LEGACY_ONLY_KEYS.includes(String(c?.key ?? "")));

  let last: string | null = null;
  for (const h of history) {
    const stage = String(h?.stage ?? "");
    const by = String(h?.by ?? "");
    if (!LEGACY_STAGES[stage] || by === AUTO_STAGE_ACTOR) continue;
    if (LEGACY_ONLY_STAGES.has(stage)) {
      last = stage;
      continue;
    }
    // 「導入準備」「運用中」を人が置けたのは旧画面だけ(受注管理ではステージを手で動かさない)
    const byPerson = by !== "" && by !== "システム";
    if (hasLegacyKeys || (byPerson && (stage === "setup" || stage === "operating"))) last = stage;
  }
  if (!last) return null;
  const { label, rank } = LEGACY_STAGES[last];
  if (rank < 2) return null;
  return {
    stageLabel: label,
    contractDone: true,
    // 「初回請求〜入金チェック」(読み替え後)だけでは、請求書を出したかまでは分からない
    invoiceIssued: rank >= 3,
    paymentChecked: rank >= 5,
  };
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
  /** 案件カード(手で付けたチェック・休止フラグ・旧画面からの引き継ぎ)。未作成なら null */
  card?: (Pick<CustomerOnboarding, "stage" | "checklist"> & { legacy?: LegacyOnboardingProgress | null }) | null;
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
  billing: "③ 請求・入金",
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
  /** システムの電子契約・書面締結の記録で締結済みか */
  signed: boolean;
  /** 契約は済んでいるか(システムの外で締結済みを含む) */
  contractDone: boolean;
  /** システムに契約書は無いが、書面・旧運用など、システムの外で締結済み */
  contractOffline: boolean;
  billingStarted: boolean;
  /** 初回請求書の扱い(このシステム / システムの外 / なし / 未定) */
  initialMode: InitialInvoiceMode;
  /** 毎月の請求(定期契約)が登録されているか(休止中を含む) */
  hasSubscription: boolean;
  /** 毎月の請求はこのシステムで行わない */
  subscriptionNone: boolean;
  /** 旧「顧客ステータス」から引き継いだ進み具合 */
  legacy: LegacyOnboardingProgress | null;
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

/**
 * 初回請求書(初期費用＋初月日割り)の扱い。
 *   system    … このシステムの請求書(区分「初期費用」)がある
 *   outside   … システムの外で発行済み(スプレッドシート・紙など。旧画面の記録からの引き継ぎを含む)
 *   none      … 初回請求なし(受注確定で作られなかった=初期費用・日割りなし、または「初回請求なし」にした)
 *   undecided … まだ決まっていない(システムに契約書が無い過去のお客様など)
 */
export type InitialInvoiceMode = "system" | "outside" | "none" | "undecided";

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
  const legacy = input.card?.legacy ?? null;
  /**
   * 手で付けるチェックの実際の状態。受注管理で付け外ししていなければ、
   * 旧「顧客ステータス」での進み具合から引き継ぐ(システムに記録が無いまま進めていた過去のお客様用)。
   */
  const effective = (key: ManualChecklistKey, legacyDone: boolean) => {
    const m = manual.get(key)!;
    if (m.done) return { done: true, doneAt: m.doneAt, doneBy: m.doneBy, fromLegacy: false };
    if (!m.updatedAt && legacyDone) {
      return { done: true, doneAt: null as string | null, doneBy: LEGACY_ACTOR, fromLegacy: true };
    }
    return { done: false, doneAt: null as string | null, doneBy: "", fromLegacy: false };
  };
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
  // システムに締結済みの契約書が無くても、書面・旧運用など、システムの外で締結済みなら契約は済んでいる
  const offlineContract = effective("ct_signed", Boolean(legacy?.contractDone));
  const contractDone = signed || offlineContract.done;

  /* ---- 請求 ---- */
  const initialInvoices = invoices
    .filter((i) => i.type === "initial" && i.status !== "canceled")
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  const initialInvoice = initialInvoices[initialInvoices.length - 1] ?? null;
  const initialPaid = initialInvoice != null && initialInvoice.status === "paid";

  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const subscriptionActive = activeSubs.length > 0;
  // 毎月の請求(定期契約)。休止中も登録済みとみなす(すべて解約なら案件ごと休止・解約の扱い)
  const hasSubscription = subscriptions.some((s) => s.status !== "canceled");
  const subscriptionNone = manual.get("sub_none")!.done;
  const linkedByContract = contracts.some((c) => !!c.linkedSubscriptionId || !!c.linkedInvoiceId);

  const issuedOutside = effective("ib_issue", Boolean(legacy?.invoiceIssued));
  let initialMode: InitialInvoiceMode;
  if (initialInvoice) initialMode = "system";
  else if (manual.get("ib_none")!.done) initialMode = "none";
  else if (issuedOutside.done) initialMode = "outside";
  // 契約書から受注確定して初回請求書が作られなかった = 初期費用・初月日割りが無い契約
  else if (linkedByContract) initialMode = "none";
  else initialMode = "undecided";

  // 請求が始まっている = 受注確定済み・毎月の請求が動いている・初回請求書を出した(システムの外を含む)
  const billingStarted =
    linkedByContract || subscriptionActive || initialInvoice != null || initialMode === "outside";

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
    legacyDone = false,
  ): OrderStepItem => {
    const m = manual.get(key)!;
    const e = effective(key, legacyDone);
    const item = mk({
      key,
      label: m.label,
      owner,
      mode: "manual",
      done: e.done,
      doneAt: e.doneAt,
      doneBy: e.doneBy,
      ...extra,
    });
    // 完了済みなら blocked/waiting は意味を持たない
    return item.done ? { ...item, blocked: false, waiting: false } : item;
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
        // システムの外で締結済み(手で付けたチェック)なら取り消せるよう manual にする
        mode: !signed && offlineContract.done ? "manual" : "auto",
        done: contractDone,
        doneAt: signed ? isoOrNull(signedContract?.signedAt) : offlineContract.doneAt,
        doneBy: signed ? "" : offlineContract.doneBy,
        waiting: !contractDone && contractWaiting,
        hint: signed
          ? `契約書 ${signedContract!.contractNumber}`
          : offlineContract.done
            ? offlineContract.fromLegacy
              ? `書面・旧運用で締結済み（旧「顧客ステータス」で「${legacy!.stageLabel}」まで進んでいたため引き継ぎ）`
              : "書面・旧運用など、システムの外で締結済み"
            : billingStarted
              ? "契約書が締結されていないまま請求が始まっています。書面・旧運用で締結済みなら「締結済みにする」を押してください。"
              : contractHint,
        late: !contractDone && billingStarted,
      }),
    ],
  };

  /* ---- ② 受注確認 ---- */
  // 旧画面で「初回請求」以降に進めていた案件は、申込内容の確認も済んでいたものとして引き継ぐ
  const reviewDone = effective("review_checked", Boolean(legacy?.contractDone)).done;
  // 申込URLを使わずに登録し、システムの外で契約したお客様(過去のお客様など)は、
  // 「請求を開始」の画面で内容を確かめるので、申込内容の確認は飛ばす
  const reviewSkipped =
    !input.application && !signed && offlineContract.done && !reviewDone && !billingStarted;
  const review: OrderTrack = {
    key: "review",
    label: orderTrackLabels.review,
    stage: "review",
    items: [
      manualItem(
        "review_checked",
        "billing",
        {
          // 受注確定まで済んでいれば確認済みとみなす
          ...(billingStarted && !reviewDone
            ? { done: true, mode: "auto" as const, doneBy: "受注確定時に確認" }
            : {}),
          blocked: !contractDone && !billingStarted,
          skipped: reviewSkipped,
          hint: reviewSkipped
            ? "申込URLを使わずに登録したお客様です（内容は「請求を開始」の画面で確かめます）"
            : "会社名・住所・代表者・連絡先、プランと金額、代理店／紹介の紐付け、重複申込がないかを確認",
        },
        Boolean(legacy?.contractDone),
      ),
      mk({
        key: "order_confirmed",
        label:
          signed || !contractDone
            ? "受注を確定（初回請求書・毎月の請求を作成）"
            : "請求を開始（初回請求書・毎月の請求を設定）",
        owner: "billing",
        mode: "auto",
        done: billingStarted,
        doneAt: isoOrNull(initialInvoice?.createdAt ?? activeSubs[0]?.startedOn),
        blocked: !contractDone && !billingStarted,
        hint: billingStarted
          ? ""
          : signed
            ? "受注管理の案件ページ、または契約書の画面から「受注を確定」してください。"
            : contractDone
              ? "システムに契約書が無いお客様です。「請求を開始」で初回請求書と毎月の請求（定期契約）を設定してください。"
              : "契約の締結後に確定できます。",
      }),
    ],
  };

  /* ---- ③ 請求・入金 ---- */
  const initialSkipped = initialMode === "none";
  const initialOverdueDays =
    initialInvoice && !initialPaid ? -daysUntil(initialInvoice.dueDate, now) : 0;
  // システムの外で発行した初回請求書の入金(旧画面で「運用中」まで進めていたら確認済みとして引き継ぐ)
  const paidOutside = effective("ip_check", Boolean(legacy?.paymentChecked));
  const initialSettled =
    initialMode === "system" ? initialPaid : initialMode === "outside" ? paidOutside.done : false;
  const subNoneItem = manual.get("sub_none")!;
  const billing: OrderTrack = {
    key: "billing",
    label: orderTrackLabels.billing,
    stage: "setup",
    items: [
      mk({
        key: "subscription_registered",
        label: "毎月の請求（定期契約）を登録",
        owner: "billing",
        mode: !hasSubscription && subscriptionNone ? "manual" : "auto",
        done: hasSubscription || subscriptionNone,
        doneAt: hasSubscription
          ? isoOrNull((activeSubs[0] ?? subscriptions.find((x) => x.status !== "canceled"))?.startedOn)
          : subNoneItem.doneAt,
        doneBy: hasSubscription ? "" : subNoneItem.doneBy,
        blocked: !billingStarted,
        hint: hasSubscription
          ? "毎月の請求書は定期契約から自動で作られます。"
          : subscriptionNone
            ? "毎月の請求はこのシステムで行わない設定です。"
            : "定期契約が無いと、毎月の請求書が作られません。プラン・店舗数を決めて登録してください。",
      }),
      initialMode === "undecided"
        ? mk({
            key: "initial_invoice_sent",
            label: "初回請求書（初期費用＋初月日割り）を用意",
            owner: "billing",
            mode: "auto",
            blocked: !billingStarted,
            hint: "このシステムで作成するか、作成済みの請求書を使うか、システムの外で発行済みか、初回請求なしかを選んでください。",
          })
        : manualItem(
            "initial_invoice_sent",
            "billing",
            {
              // 送付の記録がなくても、入金済みなら送付は済んでいる(対応待ちに残さない)
              ...(initialSettled && !effective("initial_invoice_sent", Boolean(legacy?.invoiceIssued)).done
                ? {
                    done: true,
                    mode: "auto" as const,
                    doneAt:
                      initialMode === "system" ? isoOrNull(initialInvoice?.paidAt) : paidOutside.doneAt,
                    doneBy: "入金済みのため完了",
                  }
                : {}),
              blocked: !billingStarted,
              skipped: initialSkipped,
              hint: initialSkipped
                ? "初回請求書はありません（初期費用・初月日割りなし）"
                : initialMode === "outside"
                  ? "システムの外で発行した初回請求書です。お客様へ送付済みなら「完了にする」を押してください。"
                  : "「メールで送付」で送るか、郵送・手渡しした場合は「完了にする」を押してください（入金を確認すると自動で完了します）。",
            },
            Boolean(legacy?.invoiceIssued),
          ),
      mk({
        key: "initial_paid",
        label:
          initialMode === "outside"
            ? "初回の入金を確認（システムの外で発行した請求書）"
            : "初回のお振込みを確認（入金の消し込み）",
        owner: initialMode === "outside" || initialOverdueDays > 0 ? "billing" : "customer",
        mode: initialMode === "outside" ? "manual" : "auto",
        done: initialSettled,
        doneAt: initialMode === "outside" ? paidOutside.doneAt : isoOrNull(initialInvoice?.paidAt),
        doneBy: initialMode === "outside" ? paidOutside.doneBy : "",
        blocked: !billingStarted || initialMode === "undecided",
        skipped: initialSkipped,
        waiting: initialMode === "system" && !initialPaid && initialOverdueDays <= 0,
        late: initialMode === "system" && initialOverdueDays > 0,
        hint: initialSkipped
          ? "初回請求書はありません"
          : initialSettled
            ? ""
            : initialMode === "outside"
              ? "入金を確認したら「入金を確認済みにする」を押してください（請求書をこのシステムで管理するなら「請求書を紐付ける」）。"
              : initialInvoice
                ? initialOverdueDays > 0
                  ? `支払期限を${initialOverdueDays}日過ぎています。入金確認（銀行明細の取込）と督促を行ってください。`
                  : `支払期限 ${initialInvoice.dueDate.replace(/-/g, "/")}。入金されたら「入金確認」で消し込みます。`
                : "初回請求書を用意すると確認できます。",
      }),
    ],
  };

  /* ---- ③ 口座振替(NSS) ---- */
  const formSent = Boolean(mandate?.formSentOn);
  const formReceived = Boolean(mandate?.formReceivedOn);
  const nssSubmitted = Boolean(mandate?.nssSubmittedOn);
  const nssBlocked = !contractDone && !billingStarted;
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
  else if (!billingStarted) stage = contractDone ? "review" : "application";
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
    contractDone,
    contractOffline: !signed && offlineContract.done,
    billingStarted,
    initialMode,
    hasSubscription,
    subscriptionNone,
    legacy,
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
  /** itemKeys に加えて、この条件に合う項目だけをこの分類に入れる */
  match?: (item: OrderStepItem) => boolean;
  description: string;
}[] = [
  {
    key: "review",
    label: "受注確認・請求の開始",
    itemKeys: ["review_checked", "order_confirmed"],
    owner: "billing",
    description:
      "締結済みの申込を確認して受注を確定します。システムに契約書が無い過去のお客様は「請求を開始」で初回請求書と毎月の請求を設定します",
  },
  {
    key: "contract",
    label: "契約書の作成・送付",
    itemKeys: ["contract_signed"],
    owner: "billing",
    description: "契約書が無い・下書きのまま・期限切れの案件です（書面・旧運用で締結済みなら「締結済みにする」）",
  },
  {
    key: "subscription",
    label: "毎月の請求（定期契約）の登録",
    itemKeys: ["subscription_registered"],
    owner: "billing",
    description: "定期契約が無いと毎月の請求書が作られません。プラン・店舗数を決めて登録します",
  },
  {
    key: "initial_invoice",
    label: "初回請求書の用意・送付",
    itemKeys: ["initial_invoice_sent"],
    owner: "billing",
    description: "初期費用＋初月日割りの請求書を用意して、お客様へ送ります",
  },
  {
    key: "initial_check",
    label: "初回入金の確認（システムの外で発行した請求書）",
    itemKeys: ["initial_paid"],
    owner: "billing",
    match: (item) => item.mode === "manual",
    description: "システムの外で発行した初回請求書の入金を確認して、「入金を確認済みにする」を押します",
  },
  {
    key: "initial_overdue",
    label: "初回入金の督促（期限超過）",
    itemKeys: ["initial_paid"],
    owner: "billing",
    match: (item) => item.late,
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
    if (g.match && !g.match(item)) continue;
    return g.key;
  }
  return null;
}
