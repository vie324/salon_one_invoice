"use server";

import { revalidatePath } from "next/cache";
import { generateMockSpec } from "@/lib/ai/mock";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { DevIssueUpdateInput } from "@/lib/data/repository";
import { canAccessDev, isProductAdmin } from "@/lib/domain/constants";
import type {
  DevApprovalDecision,
  DevIssueCategory,
  DevIssueExecution,
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
  /** 完了してほしい日(依頼者の希望) */
  desiredDate?: string | null;
}) {
  try {
    const user = await requireActionUser();
    if (!canAccessDev(user.roles)) {
      throw new Error("開発進捗へのアクセス権限がありません");
    }
    if (!input.title.trim()) throw new Error("課題名を入力してください");
    const repo = await getServiceRepository();
    const issue = await repo.createDevIssue({
      title: input.title.trim(),
      detail: input.detail ?? "",
      category: input.category,
      priority: input.priority,
      desiredDate: input.desiredDate || null,
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
 * - 依頼内容(課題名・詳細・分類・優先度・希望完了日)は依頼者本人または管理者のみ
 */
export async function updateDevIssueAction(id: string, input: DevIssueUpdateInput) {
  try {
    const user = await requireActionUser();
    if (!canAccessDev(user.roles)) throw new Error("開発進捗へのアクセス権限がありません");
    const repo = await getServiceRepository();
    const editsRequest =
      input.title !== undefined ||
      input.detail !== undefined ||
      input.category !== undefined ||
      input.priority !== undefined ||
      input.desiredDate !== undefined;
    if (editsRequest) {
      const existing = await repo.getDevIssue(id);
      if (!existing) throw new Error("開発依頼が見つかりません");
      if (existing.requesterId !== user.id && !isProductAdmin(user.roles)) {
        throw new Error("依頼内容の編集は依頼者本人または管理者のみ可能です");
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
 * 添付画像の追加(スクリーンショット・注釈入り画像・AIモック)。
 * dataUrl はクライアント側で縮小済みの data:image/... を想定。
 */
export async function addDevIssueAttachmentAction(
  issueId: string,
  input: { fileName: string; contentType: string; dataUrl: string; kind: "screenshot" | "mock" },
) {
  try {
    const user = await requireActionUser();
    if (!canAccessDev(user.roles)) throw new Error("開発進捗へのアクセス権限がありません");
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(input.dataUrl)) {
      throw new Error("対応していない画像形式です(PNG/JPEG/WebP)");
    }
    const repo = await getServiceRepository();
    const attachment = await repo.addDevIssueAttachment(issueId, {
      fileName: input.fileName || "image.png",
      contentType: input.contentType,
      dataUrl: input.dataUrl,
      kind: input.kind,
      uploadedBy: { id: user.id, name: user.name },
    });
    revalidatePath(`/dev/${issueId}`);
    return { ok: true as const, id: attachment.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * AIモック(ワイヤーフレーム定義)の生成。
 * 消費を抑えるため軽量なレイアウトJSONのみ生成し、画像化はブラウザ側で行う。
 */
export async function generateUiMockAction(
  description: string,
  device: "mobile" | "desktop",
) {
  try {
    const user = await requireActionUser();
    if (!canAccessDev(user.roles)) throw new Error("開発進捗へのアクセス権限がありません");
    if (!description.trim()) throw new Error("どんな画面にしたいか入力してください");
    const { spec, sample } = await generateMockSpec(description.trim(), device);
    return { ok: true as const, spec, sample };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 添付画像の削除(アップロードした本人または全体管理者)。 */
export async function deleteDevIssueAttachmentAction(id: string) {
  try {
    const user = await requireActionUser();
    if (!canAccessDev(user.roles)) throw new Error("開発進捗へのアクセス権限がありません");
    const repo = await getServiceRepository();
    const attachment = await repo.getDevIssueAttachment(id);
    if (!attachment) throw new Error("添付画像が見つかりません");
    if (attachment.uploadedById !== user.id && !isProductAdmin(user.roles)) {
      throw new Error("削除はアップロードした本人または全体管理者のみ可能です");
    }
    await repo.deleteDevIssueAttachment(id);
    revalidatePath(`/dev/${attachment.issueId}`);
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
    const user = await requireActionUser();
    if (!isProductAdmin(user.roles)) {
      throw new Error("実行有無の判定は承認者(管理者)のみ可能です");
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

/**
 * 実行有無の直接変更(全体管理者のみ)。
 * execution=null で直接設定を解除し、承諾状況からの自動判定に戻す。
 */
export async function setDevIssueExecutionAction(
  id: string,
  execution: DevIssueExecution | null,
) {
  try {
    const user = await requireActionUser();
    if (!isProductAdmin(user.roles)) {
      throw new Error("実行有無の変更は管理者のみ可能です");
    }
    if (
      execution !== null &&
      execution !== "approved" &&
      execution !== "rejected" &&
      execution !== "undecided"
    ) {
      throw new Error("不正な実行有無です");
    }
    const repo = await getServiceRepository();
    await repo.setDevIssueExecution(id, execution, { id: user.id, name: user.name });
    revalidateDev(id);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 手動の並び順を保存する(ドラッグでの入れ替え)。
 * 対応の優先順位を人が決められるようにするためのもので、開発進捗の権限があれば操作できる。
 */
export async function reorderDevIssuesAction(orderedIds: string[]) {
  try {
    const user = await requireActionUser();
    if (!canAccessDev(user.roles)) throw new Error("開発進捗へのアクセス権限がありません");
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return { ok: true as const };
    }
    const repo = await getServiceRepository();
    await repo.reorderDevIssues(orderedIds);
    revalidateDev();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
