import { isProductAdmin } from "./constants";
import type { DevIssue, DevIssuePriority, UserProfile } from "./types";
import { toISODate } from "@/lib/utils";

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

/** 記載からの経過日数 */
export function daysOpen(issue: Pick<DevIssue, "createdAt">, now = new Date()): number {
  const created = new Date(issue.createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000));
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
  /** 特に急ぐべきか(不具合の高優先 / 予定日超過 / 長期滞留) */
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
  const urgent =
    open &&
    (overdue ||
      (issue.category === "bug" && issue.priority === "high") ||
      (issue.category === "bug" && days >= STALE_DAYS));
  return { open, days, overdue, missingSchedule, pendingApprovers: pending, urgent };
}
