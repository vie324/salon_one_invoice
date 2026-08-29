import {
  devIssueCategoryLabels,
  devIssuePriorityLabels,
  devIssueStatusLabels,
  isEngineer,
  isProductAdmin,
} from "./constants";
import type {
  DevIssue,
  DevIssuePriority,
  DevIssueReply,
  DevIssueReplyRole,
  Role,
  UserProfile,
} from "./types";
import { formatDate, toISODate } from "@/lib/utils";

/**
 * 開発進捗の並べ替え・督促判定(純粋関数)。
 *
 * 方針: 不具合は業務が止まるため常に上。次に優先度、次に放置期間が長いもの。
 * 「急かす」ための材料(滞留日数・予定日の遅れ・未記入・未承諾)もここで算出する。
 */

const PRIORITY_WEIGHT: Record<DevIssuePriority, number> = { high: 0, medium: 1, low: 2 };

/** 未完了か(完了・実行なしを除く) */
export function isOpenIssue(issue: Pick<DevIssue, "status" | "execution">): boolean {
  return issue.status !== "done" && issue.execution !== "rejected";
}

/**
 * 緊急度順に並べる。
 * 1) 不具合 → 要望
 * 2) 優先度 高 → 中 → 低
 * 3) 記載日が古い順(放置されているものほど上)
 */
export function sortByUrgency<T extends Pick<DevIssue, "category" | "priority" | "createdAt">>(
  issues: T[],
): T[] {
  return [...issues].sort((a, b) => {
    if (a.category !== b.category) return a.category === "bug" ? -1 : 1;
    const p = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
    if (p !== 0) return p;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}

/** 手動で入れ替えた並び順(小さいほど上)。同値は依頼番号の新しい順。 */
export function sortByManualOrder<T extends Pick<DevIssue, "sortOrder" | "issueNumber">>(
  issues: T[],
): T[] {
  return [...issues].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.issueNumber - a.issueNumber;
  });
}

/** 記載からの経過日数 */
export function daysOpen(issue: Pick<DevIssue, "createdAt">, now = new Date()): number {
  const created = new Date(issue.createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000));
}

/** 希望完了日を過ぎている未完了の依頼か(依頼者の希望に間に合っていない) */
export function isDesiredDatePassed(
  issue: Pick<DevIssue, "status" | "execution" | "desiredDate">,
  now = new Date(),
): boolean {
  if (!isOpenIssue(issue) || !issue.desiredDate) return false;
  return issue.desiredDate < toISODate(now);
}

/**
 * 完了予定日が希望日より後か(希望に間に合わない見込み)。
 * 依頼側とエンジニアの認識ズレを早く見つけるための判定。
 */
export function isLaterThanDesired(
  issue: Pick<DevIssue, "status" | "execution" | "desiredDate" | "scheduledDate">,
): boolean {
  if (!isOpenIssue(issue) || !issue.desiredDate || !issue.scheduledDate) return false;
  return issue.scheduledDate > issue.desiredDate;
}

/** 完了予定日を過ぎている未完了の依頼か */
export function isOverdue(
  issue: Pick<DevIssue, "status" | "execution" | "scheduledDate">,
  now = new Date(),
): boolean {
  if (!isOpenIssue(issue) || !issue.scheduledDate) return false;
  return issue.scheduledDate < toISODate(now);
}

/** 完了予定日が未記入の未完了依頼か(エンジニアへの督促対象) */
export function needsSchedule(
  issue: Pick<DevIssue, "status" | "execution" | "scheduledDate" | "category">,
): boolean {
  return isOpenIssue(issue) && !issue.scheduledDate;
}

/**
 * まだ判定していない承認者(管理者)を返す。
 * 要望のみ対象。不具合は承認不要なので常に空。
 */
export function pendingApprovers(
  issue: Pick<DevIssue, "category" | "approvals" | "executionSetByName">,
  profiles: Pick<UserProfile, "id" | "name" | "roles">[],
): Pick<UserProfile, "id" | "name" | "roles">[] {
  if (issue.category !== "request") return [];
  // 管理者が実行有無を直接設定している場合は判定済みとして扱う
  if (issue.executionSetByName) return [];
  const decided = new Set(issue.approvals.map((a) => a.approverId));
  return profiles.filter((p) => isProductAdmin(p.roles) && !decided.has(p.id));
}

/**
 * 返信がどちら側からのものかを決める。
 * 依頼者本人はもちろん、業務側(請求管理者・管理者)の代理回答も依頼者側として扱う。
 * エンジニアの投稿だけが engineer(追いヒアリング)になる。
 */
export function replyAuthorRole(params: {
  authorId: string;
  authorRoles: Role[];
  requesterId: string;
}): DevIssueReplyRole {
  if (params.authorId === params.requesterId) return "requester";
  return isEngineer(params.authorRoles) ? "engineer" : "requester";
}

/** 追加ヒアリングのやり取り状況(バッジ・督促に使う) */
export interface HearingState {
  /** 追加ヒアリング中か */
  active: boolean;
  /** やり取りの件数 */
  replyCount: number;
  /** 最後の返信(無ければ null) */
  lastReply: DevIssueReply | null;
  /**
   * 依頼者の返信が届いていて、エンジニアがまだ動いていない状態。
   * (ヒアリング中で、最後の返信が依頼者側)
   */
  answered: boolean;
  /**
   * 依頼者の返信待ち。
   * (ヒアリング中で、返信が無いか、最後の返信がエンジニア側 = 質問しっぱなし)
   */
  awaitingReply: boolean;
}

/**
 * 追加ヒアリングの状況を求める。
 * ステータスが「追加ヒアリング」の間だけ督促対象になり、
 * エンジニアが対応中・完了に戻せば自然に消える。
 */
export function hearingState(
  issue: Pick<DevIssue, "status" | "replies">,
): HearingState {
  const replies = issue.replies ?? [];
  const active = issue.status === "hearing";
  const lastReply = replies.length > 0 ? replies[replies.length - 1] : null;
  const answered = active && lastReply?.authorRole === "requester";
  return {
    active,
    replyCount: replies.length,
    lastReply,
    answered,
    awaitingReply: active && !answered,
  };
}

/** 依頼1件の督促サマリー(バッジ・アラート表示に使う) */
export interface DevIssueUrgency {
  open: boolean;
  /** 記載からの経過日数 */
  days: number;
  /** 完了予定日の超過 */
  overdue: boolean;
  /** 完了予定日が未記入 */
  missingSchedule: boolean;
  /** 未判定の承認者(要望のみ) */
  pendingApprovers: string[];
  /** 依頼者の希望完了日を過ぎている */
  desiredPassed: boolean;
  /** 完了予定日が希望日より後(希望に間に合わない見込み) */
  laterThanDesired: boolean;
  /** 追加ヒアリングに依頼者の返信が届いている(エンジニアが確認する番) */
  hearingAnswered: boolean;
  /** 追加ヒアリングの返信待ち(依頼者が答える番) */
  hearingAwaitingReply: boolean;
  /** 追加ヒアリングのやり取り件数 */
  hearingReplyCount: number;
  /** 特に急ぐべきか(不具合の高優先 / 予定日超過 / 長期滞留 / ヒアリング返信の放置) */
  urgent: boolean;
}

/** 長期滞留とみなす日数 */
export const STALE_DAYS = 7;

export function issueUrgency(
  issue: DevIssue,
  profiles: Pick<UserProfile, "id" | "name" | "roles">[],
  now = new Date(),
): DevIssueUrgency {
  const open = isOpenIssue(issue);
  const days = daysOpen(issue, now);
  const overdue = isOverdue(issue, now);
  const missingSchedule = needsSchedule(issue);
  const pending = pendingApprovers(issue, profiles).map((p) => p.name);
  const desiredPassed = isDesiredDatePassed(issue, now);
  const laterThanDesired = isLaterThanDesired(issue);
  const hearing = hearingState(issue);
  const urgent =
    open &&
    (overdue ||
      desiredPassed ||
      // 返信は届いているのに止まっている状態は、依頼者を待たせているので急ぐ
      hearing.answered ||
      (issue.category === "bug" && issue.priority === "high") ||
      (issue.category === "bug" && days >= STALE_DAYS));
  return {
    open,
    days,
    overdue,
    missingSchedule,
    pendingApprovers: pending,
    desiredPassed,
    laterThanDesired,
    hearingAnswered: hearing.answered,
    hearingAwaitingReply: hearing.awaitingReply,
    hearingReplyCount: hearing.replyCount,
    urgent,
  };
}

/**
 * 共有メッセージ用の1行サマリー。
 * 受け取った相手が、リンクを開く前に「何を・どれくらい急ぐか」を掴めるようにする。
 */
export function devIssueShareSummary(
  issue: Pick<
    DevIssue,
    "issueNumber" | "title" | "category" | "priority" | "status" | "desiredDate"
  >,
): string {
  const meta = [
    devIssueCategoryLabels[issue.category],
    `優先度${devIssuePriorityLabels[issue.priority]}`,
    devIssueStatusLabels[issue.status],
  ].join("・");
  const desired = issue.desiredDate ? ` / 希望日 ${formatDate(issue.desiredDate)}` : "";
  return `#${issue.issueNumber} ${issue.title}（${meta}${desired}）`;
}
