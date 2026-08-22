"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import type { OnboardingChecklistToggle } from "@/lib/data/repository";
import type { OnboardingStage } from "@/lib/domain/types";

function revalidateBoard() {
  revalidatePath("/pipeline");
}

/**
 * カードのステージ移動(ドラッグ&ドロップ)。
 * orderedIds は移動先の列に並ぶカードID(上から順・移動したカードを含む)。
 */
export async function moveOnboardingCardAction(
  id: string,
  stage: OnboardingStage,
  orderedIds: string[],
) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    await repo.updateOnboarding(id, { stage, actor: user.name });
    if (orderedIds.length > 1) await repo.reorderOnboardings(orderedIds);
    revalidateBoard();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 同一列内での並び替え。 */
export async function reorderOnboardingCardsAction(orderedIds: string[]) {
  try {
    const repo = await getServiceRepository();
    await requireActionUser();
    await repo.reorderOnboardings(orderedIds);
    revalidateBoard();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** カード詳細の更新(期日・次のアクション・チェックリスト・ステージ)。 */
export async function updateOnboardingCardAction(
  id: string,
  input: {
    stage?: OnboardingStage;
    dueDate?: string | null;
    nextAction?: string;
    checklist?: OnboardingChecklistToggle[];
  },
) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    const card = await repo.updateOnboarding(id, { ...input, actor: user.name });
    revalidateBoard();
    return { ok: true as const, card };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 実データとの一括同期。契約・請求・入金・口座振替の状況から導出した
 * 推奨ステージへ、ズレているカードをまとめて移動する。
 */
export async function syncOnboardingStagesAction(
  moves: { id: string; stage: OnboardingStage }[],
) {
  try {
    const repo = await getServiceRepository();
    const user = await requireActionUser();
    let count = 0;
    for (const m of moves) {
      await repo.updateOnboarding(m.id, {
        stage: m.stage,
        actor: `${user.name}(データ同期)`,
      });
      count++;
    }
    revalidateBoard();
    return { ok: true as const, count };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
