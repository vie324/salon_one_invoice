"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { DevScheduleItemUpdateInput } from "@/lib/data/repository";
import { canEditDevSchedule } from "@/lib/domain/constants";
import type { DevScheduleStatus } from "@/lib/domain/types";

function revalidateSchedule() {
  revalidatePath("/dev/schedule");
  // ナビの表示可否が変わるためレイアウトごと再検証する
  revalidatePath("/", "layout");
}

/** 表の編集(項目の追加・変更・並べ替え・閲覧メンバーの設定)は管理者のみ */
async function requireScheduleEditor() {
  const user = await requireActionUser();
  if (!canEditDevSchedule(user.roles)) {
    throw new Error("開発スケジュールの編集は管理者のみ可能です");
  }
  return user;
}

/** 依頼番号 → 依頼ID。存在しない番号は呼び出し側へ伝える。 */
async function resolveIssueIds(
  numbers: number[],
): Promise<{ ids: string[]; missing: number[] }> {
  if (numbers.length === 0) return { ids: [], missing: [] };
  const repo = await getServiceRepository();
  const issues = await repo.listDevIssues();
  const byNumber = new Map(issues.map((i) => [i.issueNumber, i.id]));
  const ids: string[] = [];
  const missing: number[] = [];
  for (const n of numbers) {
    const id = byNumber.get(n);
    if (id) ids.push(id);
    else missing.push(n);
  }
  return { ids, missing };
}

export interface ScheduleItemFormInput {
  category?: string;
  title: string;
  priority?: number;
  status?: DevScheduleStatus;
  targetMonth?: string | null;
  targetDate?: string | null;
  confirmed?: boolean;
  note?: string;
  /** 連動させる開発進捗の依頼番号(#143 など)。未指定なら連動を変更しない。 */
  issueNumbers?: number[];
}

/** スケジュール項目の追加(管理者のみ)。 */
export async function createDevScheduleItemAction(input: ScheduleItemFormInput) {
  try {
    await requireScheduleEditor();
    const title = input.title.trim();
    if (!title) throw new Error("機能名を入力してください");
    const { ids, missing } = await resolveIssueIds(input.issueNumbers ?? []);
    const repo = await getServiceRepository();
    const item = await repo.createDevScheduleItem({
      category: input.category?.trim() ?? "",
      title,
      priority: input.priority,
      status: input.status,
      targetMonth: input.targetMonth || null,
      targetDate: input.targetDate || null,
      confirmed: input.confirmed,
      note: input.note?.trim() ?? "",
      issueIds: ids,
    });
    revalidateSchedule();
    return { ok: true as const, id: item.id, missing };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** スケジュール項目の更新(管理者のみ)。 */
export async function updateDevScheduleItemAction(id: string, input: ScheduleItemFormInput) {
  try {
    await requireScheduleEditor();
    const patch: DevScheduleItemUpdateInput = {
      category: input.category?.trim(),
      priority: input.priority,
      status: input.status,
      targetMonth: input.targetMonth === undefined ? undefined : input.targetMonth || null,
      targetDate: input.targetDate === undefined ? undefined : input.targetDate || null,
      confirmed: input.confirmed,
      note: input.note?.trim(),
    };
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new Error("機能名を入力してください");
      patch.title = title;
    }
    let missing: number[] = [];
    if (input.issueNumbers !== undefined) {
      const resolved = await resolveIssueIds(input.issueNumbers);
      patch.issueIds = resolved.ids;
      missing = resolved.missing;
    }
    const repo = await getServiceRepository();
    await repo.updateDevScheduleItem(id, patch);
    revalidateSchedule();
    return { ok: true as const, missing };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** スケジュール項目の削除(管理者のみ)。連動が外れるだけで依頼自体は残る。 */
export async function deleteDevScheduleItemAction(id: string) {
  try {
    await requireScheduleEditor();
    const repo = await getServiceRepository();
    await repo.deleteDevScheduleItem(id);
    revalidateSchedule();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** ドラッグでの並べ替えを保存する(管理者のみ)。 */
export async function reorderDevScheduleItemsAction(orderedIds: string[]) {
  try {
    await requireScheduleEditor();
    const repo = await getServiceRepository();
    await repo.reorderDevScheduleItems(orderedIds);
    revalidateSchedule();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * スケジュール表を閲覧できるメンバーの設定(管理者のみ)。
 * 管理者は常に閲覧できるため、チェックの対象外にする。
 */
export async function setScheduleVisibilityAction(userId: string, visible: boolean) {
  try {
    await requireScheduleEditor();
    const repo = await getServiceRepository();
    const profiles = await repo.listUserProfiles();
    const target = profiles.find((p) => p.id === userId);
    if (!target) throw new Error("アカウントが見つかりません");
    await repo.setScheduleVisibility(userId, visible);
    revalidateSchedule();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
