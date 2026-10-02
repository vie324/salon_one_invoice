import {
  applicationCustomerState,
  applicationDisplayStatus,
  type ApplicationCustomerState,
} from "@/lib/domain/application";
import { outstandingAmount } from "@/lib/domain/calculations";
import type {
  Application,
  ApplicationDisplayStatus,
  InvoiceStatus,
  InvoiceWithCustomer,
} from "@/lib/domain/types";
import type { OrderBook, OrderRow } from "./load";

/**
 * 申込ごとの「顧客・請求」のまとめ。申込・契約URLの一覧と申込の詳細で、
 * 請求書を作れるか・発行済みの請求書と入金の状況を出すのに使う。
 */
export interface ApplicationBilling {
  state: ApplicationCustomerState;
  /** 画面に出す対応状況(顧客の実在に合わせて読み替えたもの) */
  display: ApplicationDisplayStatus;
  /** 受注管理の案件(顧客が存在するときだけ) */
  row: OrderRow | null;
  /** 取消以外の請求書(発行日の新しい順) */
  invoices: InvoiceWithCustomer[];
  /** 送付済みで入金待ちの請求書(一部入金・期限超過・引落失敗を含む) */
  unpaidCount: number;
  unpaidAmount: number;
  draftCount: number;
  /** 締結済みの契約書があり、受注確定(請求の開始)を待っている */
  awaitingConfirm: boolean;
}

const UNPAID_STATUSES: InvoiceStatus[] = [
  "sent",
  "awaiting_payment",
  "partially_paid",
  "overdue",
  "failed",
];

/** 受注管理の案件一覧から、申込ごとのまとめを引く関数を作る */
export function applicationBillingLookup(book: OrderBook): (app: Application) => ApplicationBilling {
  const rows = new Map(book.rows.map((r) => [r.customer.id, r]));
  const liveCustomerIds = new Set(rows.keys());
  return (app) => {
    const state = applicationCustomerState(app, liveCustomerIds);
    const row = state === "registered" && app.customerId ? (rows.get(app.customerId) ?? null) : null;
    const invoices = (row?.invoices ?? [])
      .filter((i) => i.status !== "canceled")
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    const unpaid = invoices.filter((i) => UNPAID_STATUSES.includes(i.status));
    return {
      state,
      display: applicationDisplayStatus(app, state),
      row,
      invoices,
      unpaidCount: unpaid.length,
      unpaidAmount: unpaid.reduce((sum, i) => sum + outstandingAmount(i), 0),
      draftCount: invoices.filter((i) => i.status === "draft").length,
      awaitingConfirm: Boolean(row && row.progress.signed && !row.progress.billingStarted),
    };
  };
}

/**
 * 申込から請求書の作成画面を開くURL。初回請求書(初期費用＋初月日割り)をまだ決めていない
 * お客様は、区分を「初期費用」にして開く(受注管理の初回請求書・入金の確認として扱われる)。
 */
export function newInvoiceHref(customerId: string, billing: Pick<ApplicationBilling, "row">): string {
  const undecided = billing.row?.progress.initialMode === "undecided";
  return `/invoices/new?customer=${customerId}${undecided ? "&type=initial" : ""}`;
}
