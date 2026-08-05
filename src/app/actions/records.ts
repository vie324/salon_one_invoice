"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { canAccessBilling, isProductAdmin } from "@/lib/domain/constants";
import type { DeletableEntity } from "@/lib/domain/types";

const ENTITIES: DeletableEntity[] = [
  "invoice",
  "customer",
  "payment",
  "subscription",
  "bank_transaction",
  "batch",
];

/** 削除・復元は請求まわりの一覧すべてに影響するため広めに再検証する */
function revalidateRecords() {
  for (const path of [
    "/dashboard",
    "/invoices",
    "/customers",
    "/payments",
    "/subscriptions",
    "/direct-debit",
    "/trash",
  ]) {
    revalidatePath(path);
  }
  revalidatePath("/", "layout");
}

function assertEntity(entity: DeletableEntity) {
  if (!ENTITIES.includes(entity)) throw new Error("不正なデータ種別です");
}

/**
 * 削除(ゴミ箱へ移動)。
 * データは消さずに一覧・集計から外すだけなので、あとから復元できる。
 * 誰がいつ何を、どんな理由で消したかは操作ログに残る。
 */
export async function softDeleteRecordAction(
  entity: DeletableEntity,
  id: string,
  reason: string,
) {
  try {
    const user = await requireActionUser();
    if (!canAccessBilling(user.roles)) {
      throw new Error("請求データの削除は請求管理者・管理者のみ可能です");
    }
    assertEntity(entity);
    const repo = await getServiceRepository();
    await repo.softDeleteRecord(entity, id, { actor: user.name, reason: reason.trim() });
    revalidateRecords();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 復元(ゴミ箱から戻す)。誤削除の取り消し。 */
export async function restoreRecordAction(entity: DeletableEntity, id: string) {
  try {
    const user = await requireActionUser();
    if (!canAccessBilling(user.roles)) {
      throw new Error("請求データの復元は請求管理者・管理者のみ可能です");
    }
    assertEntity(entity);
    const repo = await getServiceRepository();
    await repo.restoreRecord(entity, id, { actor: user.name });
    revalidateRecords();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 管理者だけが使える一括削除(テスト投入データの片付け用)。
 * 1件ずつの削除と同じくログを残し、いつでも復元できる。
 */
export async function softDeleteRecordsAction(
  items: { entity: DeletableEntity; id: string }[],
  reason: string,
) {
  try {
    const user = await requireActionUser();
    if (!isProductAdmin(user.roles)) {
      throw new Error("まとめて削除できるのは管理者のみです");
    }
    const repo = await getServiceRepository();
    let done = 0;
    for (const item of items) {
      assertEntity(item.entity);
      await repo.softDeleteRecord(item.entity, item.id, {
        actor: user.name,
        reason: reason.trim(),
      });
      done += 1;
    }
    revalidateRecords();
    return { ok: true as const, count: done };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
