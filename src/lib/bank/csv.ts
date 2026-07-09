import type {
  BankTransaction,
  Customer,
  DirectDebitBatch,
  DirectDebitMandate,
  InvoiceWithCustomer,
} from "@/lib/domain/types";
import type { BankRowInput } from "@/lib/data/repository";
import { toISODate } from "@/lib/utils";

/** CSV1行を安全に分割(簡易: ダブルクオート対応) */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDate(raw: string): string | null {
  const s = raw.replace(/["']/g, "").trim();
  // YYYY/MM/DD, YYYY-MM-DD, YYYYMMDD
  let m = s.match(/^(\d{4})[/-]?(\d{1,2})[/-]?(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // 和暦や区切り違いは Date に委譲
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return toISODate(d);
  return null;
}

function parseAmount(raw: string): number {
  return parseInt(raw.replace(/[^\d-]/g, ""), 10) || 0;
}

/**
 * 銀行明細CSVを取り込む。想定ヘッダ(順不同・日本語/英語両対応):
 *   日付/取引日/date, 入金額/金額/amount, 振込人/依頼人/payer, 摘要/内容/description
 * ヘッダが無い場合は「日付,金額,振込人,摘要」の順とみなす。
 */
export function parseBankCsv(text: string): BankRowInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const header = splitCsvLine(lines[0]);
  const idxOf = (keys: string[]) =>
    header.findIndex((h) => keys.some((k) => h.includes(k)));
  const hasHeader = /日|date|金額|amount|摘要|振込|payer/i.test(lines[0]);

  let dateIdx = 0,
    amountIdx = 1,
    payerIdx = 2,
    descIdx = 3;
  if (hasHeader) {
    dateIdx = Math.max(0, idxOf(["日付", "取引日", "date"]));
    amountIdx = Math.max(1, idxOf(["入金", "金額", "amount"]));
    payerIdx = Math.max(2, idxOf(["振込人", "依頼人", "payer", "名義"]));
    descIdx = Math.max(3, idxOf(["摘要", "内容", "description", "備考"]));
  }

  const rows: BankRowInput[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = splitCsvLine(line);
    const date = parseDate(cells[dateIdx] ?? "");
    const amount = parseAmount(cells[amountIdx] ?? "");
    if (!date || amount <= 0) continue; // 入金(正の額)のみ対象
    rows.push({
      transactionDate: date,
      amount,
      payerName: cells[payerIdx] ?? "",
      description: cells[descIdx] ?? "",
    });
  }
  return rows;
}

/** カナ/記号を正規化して緩く比較するためのキー */
function normalizeName(s: string): string {
  return (s || "")
    .replace(/[\s　（）()「」\-ー・]/g, "")
    .replace(/[ァ-ン]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)) // 全角カナ→ひらがな寄せ
    .toLowerCase();
}

export interface MatchSuggestion {
  txnId: string;
  invoiceId: string;
  score: number;
  reason: string;
}

/**
 * 未消込の入金明細と未入金請求の照合候補を提案する。
 * 金額一致を主、振込人名義の類似を従にスコアリング。
 */
export function suggestMatches(
  txns: BankTransaction[],
  invoices: InvoiceWithCustomer[],
): MatchSuggestion[] {
  const openTxns = txns.filter((t) => !t.matchedInvoiceId);
  const openInvoices = invoices.filter(
    (i) => i.amountPaid < i.total && i.status !== "draft" && i.status !== "canceled",
  );
  const suggestions: MatchSuggestion[] = [];
  for (const txn of openTxns) {
    const payerKey = normalizeName(txn.payerName);
    let best: MatchSuggestion | null = null;
    for (const inv of openInvoices) {
      const due = inv.total - inv.amountPaid;
      if (txn.amount !== due) continue; // 金額一致を必須に
      const nameKey = normalizeName(inv.customer?.kana || inv.customer?.name || "");
      const nameHit =
        payerKey.length > 0 &&
        (nameKey.includes(payerKey) || payerKey.includes(nameKey.slice(0, 3)));
      const score = 60 + (nameHit ? 40 : 0);
      const cand: MatchSuggestion = {
        txnId: txn.id,
        invoiceId: inv.id,
        score,
        reason: nameHit ? "金額・名義が一致" : "金額が一致",
      };
      if (!best || cand.score > best.score) best = cand;
    }
    if (best) suggestions.push(best);
  }
  return suggestions;
}

/**
 * 口座振替バッチを収納代行向けの汎用CSVに出力する。
 * (全銀フォーマットに近い列。実際の収納代行の仕様に合わせて調整可能)
 */
export function batchToCsv(
  batch: DirectDebitBatch,
  customers: Customer[],
  mandates: DirectDebitMandate[],
): string {
  const header = [
    "顧客コード",
    "顧客名",
    "銀行名",
    "支店コード",
    "預金種目",
    "口座番号",
    "口座名義",
    "引落金額",
    "引落予定日",
  ];
  const lines = batch.items.map((item) => {
    const cus = customers.find((c) => c.id === item.customerId);
    const man = mandates.find((m) => m.id === item.mandateId);
    return [
      cus?.code ?? "",
      cus?.name ?? "",
      man?.bankName ?? "",
      man?.branchCode ?? "",
      man?.accountType ?? "",
      man?.accountNumber ?? "",
      man?.accountHolderKana ?? "",
      String(item.amount),
      batch.scheduledDate.replace(/-/g, ""),
    ];
  });
  return toCsv([header, ...lines]);
}

/** 2次元配列を CSV 文字列に(BOM付きで Excel の文字化け回避) */
export function toCsv(rows: (string | number)[][], withBom = true): string {
  const body = rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
  return (withBom ? "﻿" : "") + body;
}
