import type {
  DevIssue,
  DevScheduleItem,
  DevScheduleLinkedIssue,
  DevScheduleStatus,
} from "./types";
import { addMonths, currentMonth, toISODate } from "@/lib/utils";

/**
 * 開発スケジュール(中長期ロードマップ)の並べ替え・期間の割り当て(純粋関数)。
 *
 * 方針: 週次の開発MTGで「今週やること」だけを短く共有できるようにする。
 * 依頼(DevIssue)は機能の下に束ねるため、画面に出る行数は依頼の件数ではなく
 * 機能の件数になる。横軸は月、その中を週で区切って扱う。
 */

/* ---- 週(月曜はじまり) ---- */

/** その日を含む週の月曜日 */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay(): 0=日曜。月曜はじまりにするため日曜は6日戻す。
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d;
}

/** その日を含む週の日曜日 */
export function endOfWeek(date: Date): Date {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  return d;
}

/** 週の識別キー(その週の月曜日の YYYY-MM-DD) */
export function weekKey(date: Date): string {
  return toISODate(startOfWeek(date));
}

/** 週の範囲(表示・判定用) */
export interface WeekRange {
  /** 月曜日 (YYYY-MM-DD) */
  start: string;
  /** 日曜日 (YYYY-MM-DD) */
  end: string;
}

export function weekRange(date: Date): WeekRange {
  return { start: toISODate(startOfWeek(date)), end: toISODate(endOfWeek(date)) };
}

/** 「9/7週」のような短い見出し */
export function formatWeekLabel(range: WeekRange): string {
  const [, m, d] = range.start.split("-");
  return `${Number(m)}/${Number(d)}週`;
}

/** 日付を「9/7」の短い表記にする(スプレッドシートと同じ) */
export function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  if (!m || !d) return "";
  return `${Number(m)}/${Number(d)}`;
}

/** 日付が週の範囲に入っているか */
export function isInWeek(iso: string | null, range: WeekRange): boolean {
  if (!iso) return false;
  return iso >= range.start && iso <= range.end;
}

/* ---- 期間の割り当て ---- */

/** 項目が属する月(target_month 優先、無ければ target_date から補う) */
export function itemMonth(item: Pick<DevScheduleItem, "targetMonth" | "targetDate">): string | null {
  if (item.targetMonth) return item.targetMonth;
  if (item.targetDate) return item.targetDate.slice(0, 7);
  return null;
}

/**
 * 横軸に並べる月を決める。
 * 当月を起点に、登録されている項目が収まる範囲へ広げる(最低 months ヶ月)。
 */
export function timelineMonths(
  items: Pick<DevScheduleItem, "targetMonth" | "targetDate">[],
  opts?: { months?: number; now?: Date },
): string[] {
  const span = Math.max(1, opts?.months ?? 4);
  const base = currentMonth(opts?.now ?? new Date());
  const months = new Set<string>();
  for (let i = 0; i < span; i += 1) months.add(addMonths(base, i));
  for (const item of items) {
    const m = itemMonth(item);
    // 過ぎた月は「当月より前」としてまとめるので列には出さない
    if (m && m >= base) months.add(m);
  }
  return [...months].sort();
}

/* ---- 並べ替え ---- */

const STATUS_WEIGHT: Record<DevScheduleStatus, number> = {
  in_progress: 0,
  planned: 1,
  done: 2,
  dropped: 3,
};

/**
 * 表示順。
 * 1) 手動の並び順(小さいほど上)
 * 2) 日程が決まっているものを先に(未定は後ろ)
 * 3) 優先度が高い順
 */
export function sortScheduleItems<
  T extends Pick<DevScheduleItem, "sortOrder" | "targetDate" | "priority">,
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (!!a.targetDate !== !!b.targetDate) return a.targetDate ? -1 : 1;
    if (a.targetDate && b.targetDate && a.targetDate !== b.targetDate) {
      return a.targetDate < b.targetDate ? -1 : 1;
    }
    return b.priority - a.priority;
  });
}

/** 進行中のもの(完了・見送りを除く) */
export function isActiveScheduleItem(item: Pick<DevScheduleItem, "status">): boolean {
  return item.status !== "done" && item.status !== "dropped";
}

/**
 * 「今週進めるもの」か。
 * 目安日が今週に入っているもの、または手動で「今週対応」にしたもの。
 */
export function isThisWeek(
  item: Pick<DevScheduleItem, "status" | "targetDate">,
  range: WeekRange,
): boolean {
  if (!isActiveScheduleItem(item)) return false;
  return item.status === "in_progress" || isInWeek(item.targetDate, range);
}

/**
 * 予定日が今週より前なのに終わっていないもの(持ち越し)。
 * 督促というより「今週に載せ直す候補」として静かに出す。
 */
export function isCarriedOver(
  item: Pick<DevScheduleItem, "status" | "targetDate">,
  range: WeekRange,
): boolean {
  if (!isActiveScheduleItem(item) || !item.targetDate) return false;
  return item.targetDate < range.start;
}

/* ---- 開発進捗との連動 ---- */

/**
 * 「#143/#156 #138」のような入力から依頼番号を取り出す。
 * 開発MTGでは番号(#00)で会話しているため、送られてきた文字列をそのまま貼れるようにする。
 */
export function parseIssueNumbers(input: string): number[] {
  const numbers = (input.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0);
  return [...new Set(numbers)];
}


/** 連動している依頼の進み具合 */
export interface ScheduleProgress {
  /** 連動している依頼の件数 */
  total: number;
  /** 完了した件数 */
  done: number;
  /** 対応中の件数 */
  inProgress: number;
  /** 追加ヒアリングで止まっている件数 */
  hearing: number;
  /** 未対応の件数 */
  open: number;
  /** 0〜100 の進捗率(連動が無ければ 0) */
  percent: number;
}

export function scheduleProgress(links: DevScheduleLinkedIssue[]): ScheduleProgress {
  // 「実行なし」と判定された依頼は母数から外す(数えると進まないように見えるため)
  const live = links.filter((l) => l.execution !== "rejected");
  const total = live.length;
  const done = live.filter((l) => l.status === "done").length;
  const inProgress = live.filter((l) => l.status === "in_progress").length;
  const hearing = live.filter((l) => l.status === "hearing").length;
  const open = live.filter((l) => l.status === "open").length;
  return {
    total,
    done,
    inProgress,
    hearing,
    open,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** 依頼(DevIssue)を連動表示用の要約に落とす */
export function toLinkedIssue(issue: DevIssue): DevScheduleLinkedIssue {
  return {
    issueId: issue.id,
    issueNumber: issue.issueNumber,
    title: issue.title,
    category: issue.category,
    priority: issue.priority,
    status: issue.status,
    execution: issue.execution,
    scheduledDate: issue.scheduledDate,
    completedDate: issue.completedDate,
  };
}

/**
 * 開発MTGでそのまま送れる共有文。
 * 依頼番号(#143)を機能ごとにまとめるので、送る側も受け取る側も
 * 「今週は機能◯件」という粒度で会話できる。
 */
export function weekShareText(
  items: (Pick<DevScheduleItem, "title" | "targetDate" | "note"> & {
    links: Pick<DevScheduleLinkedIssue, "issueNumber">[];
  })[],
  range: WeekRange,
): string {
  if (items.length === 0) return `${formatWeekLabel(range)}: 予定なし`;
  const lines = items.map((item) => {
    const numbers = item.links.map((l) => `#${l.issueNumber}`).join(" ");
    const date = formatShortDate(item.targetDate);
    const head = date ? `${item.title}（${date}）` : item.title;
    return `・${head}${numbers ? ` ${numbers}` : ""}`;
  });
  return [`${formatWeekLabel(range)} 進める分（${items.length}件）`, ...lines].join("\n");
}
