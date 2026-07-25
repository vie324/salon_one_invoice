"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { DevIssueUpdateInput } from "@/lib/data/repository";
import { canAccessDev, isProductAdmin } from "@/lib/domain/constants";
import type {
  DevApprovalDecision,
  DevIssueCategory,
  DevIssuePriority,
} from "@/lib/domain/types";

function revalidateDev(id?: string) {
  revalidatePath("/dev");
  if (id) revalidatePath(`/dev/${id}`);
  // 通知ベル(レイアウト)と完了通知バナーを更新する
  revalidatePath("/", "layout");
}

/** 新規依頼の登録。記載日・依頼者はログイン中のアカウントから自動記録する。 */
export async function createDevIssueAction(input: {
  title: string;
  detail?: string;
  category: DevIssueCategory;
  priority?: DevIssuePriority;
}) {
  try {
    const user = await getCurrentUser();
    if (!canAccessDev(user.role)) {
      throw new Error("開発進捗へのアクセス権限がありません");
    }
    if (!input.title.trim()) throw new Error("課題名を入力してください");
    const repo = await getServiceRepository();
    const issue = await repo.createDevIssue({
      title: input.title.trim(),
      detail: input.detail ?? "",
      category: input.category,
      priority: input.priority,
      requester: { id: user.id, name: user.name },
    });
    revalidateDev(issue.id);
    return { ok: true as const, id: issue.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 依頼の更新。
 * - エンジニア入力欄(ステータス・完了予定日・完了日・開発対応内容)は開発進捗の権限があれば更新可
 * - 依頼内容(課題名・詳細・分類・優先度)は依頼者本人または全体管理者のみ
 */
export async function updateDevIssueAction(id: string, input: DevIssueUpdateInput) {
  try {
    const user = await getCurrentUser();
    if (!canAccessDev(user.role)) throw new Error("開発進捗へのアクセス権限がありません");
    const repo = await getServiceRepository();
    const editsRequest =
      input.title !== undefined ||
      input.detail !== undefined ||
      input.category !== undefined ||
      input.priority !== undefined;
    if (editsRequest) {
      const existing = await repo.getDevIssue(id);
      if (!existing) throw new Error("開発依頼が見つかりません");
      if (existing.requesterId !== user.id && !isProductAdmin(user.role)) {
        throw new Error("依頼内容の編集は依頼者本人または全体管理者のみ可能です");
      }
    }
    await repo.updateDevIssue(id, input, { id: user.id, name: user.name });
    revalidateDev(id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 実行有無の判定(プロダクト管理者のみ)。
 * decision: "approve"=承諾 / "reject"=停止 / null=自分の判定を取り消す。
 */
export async function setDevIssueApprovalAction(
  id: string,
  decision: DevApprovalDecision | null,
) {
  try {
    const user = await getCurrentUser();
    if (!isProductAdmin(user.role)) {
      throw new Error("実行有無の判定はプロダクト管理者(全体管理者)のみ可能です");
    }
    if (decision !== null && decision !== "approve" && decision !== "reject") {
      throw new Error("不正な判定です");
    }
    const repo = await getServiceRepository();
    await repo.setDevIssueApproval(id, { id: user.id, name: user.name }, decision);
    revalidateDev(id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
