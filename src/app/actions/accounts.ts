"use server";

import { revalidatePath } from "next/cache";
import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { ASSIGNABLE_ROLES, isProductAdmin } from "@/lib/domain/constants";
import type { Role } from "@/lib/domain/types";

const assignable = (role: Role) => ASSIGNABLE_ROLES.some((r) => r.value === role);

/** 入力された役割を検証して正規化する(重複除去・1件以上・未知の値を拒否)。 */
function validateRoles(roles: Role[]): Role[] {
  const unique = [...new Set(roles ?? [])];
  if (unique.length === 0) throw new Error("役割を1つ以上選んでください");
  for (const r of unique) {
    if (!assignable(r)) throw new Error("不正な役割が含まれています");
  }
  return unique;
}

/** ロール変更はナビ・ガードに影響するためレイアウトごと再検証する */
function revalidateAccounts() {
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

/** 役割の変更(管理者のみ)。複数の役割を兼務できる。 */
export async function updateUserRolesAction(userId: string, roles: Role[]) {
  try {
    const user = await requireActionUser();
    if (!isProductAdmin(user.roles)) {
      throw new Error("アカウント管理は管理者のみ可能です");
    }
    const next = validateRoles(roles);
    if (userId === user.id && !next.includes("admin")) {
      throw new Error("自分自身の管理者権限は外せません(他の管理者に依頼してください)");
    }
    const repo = await getServiceRepository();
    await repo.updateUserRoles(userId, next);
    revalidateAccounts();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * 初期セットアップ: 全体管理者が1人もいない場合に限り、
 * ログイン中の自分を全体管理者にする(Supabase を直接触らずに開始できる)。
 */
export async function claimFirstAdminAction() {
  try {
    const user = await requireActionUser();
    const repo = await getServiceRepository();
    const profiles = await repo.listUserProfiles();
    if (profiles.some((p) => isProductAdmin(p.roles))) {
      throw new Error("既に管理者が存在します(既存の管理者に役割変更を依頼してください)");
    }
    await repo.updateUserRoles(user.id, ["admin"]);
    revalidateAccounts();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 表示名の変更(本人または全体管理者)。 */
export async function updateAccountNameAction(userId: string, name: string) {
  try {
    const user = await requireActionUser();
    if (userId !== user.id && !isProductAdmin(user.roles)) {
      throw new Error("他のアカウントの変更は管理者のみ可能です");
    }
    if (!name.trim()) throw new Error("名前を入力してください");
    const repo = await getServiceRepository();
    await repo.updateUserName(userId, name.trim());
    revalidateAccounts();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** パスワードの再設定(本人または全体管理者)。 */
export async function resetAccountPasswordAction(userId: string, password: string) {
  try {
    const user = await requireActionUser();
    if (userId !== user.id && !isProductAdmin(user.roles)) {
      throw new Error("他のアカウントのパスワード再設定は管理者のみ可能です");
    }
    if (password.length < 8) throw new Error("パスワードは8文字以上にしてください");
    const repo = await getServiceRepository();
    await repo.updateAccountPassword(userId, password);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** アカウントの削除(全体管理者のみ・自分自身は不可)。 */
export async function deleteAccountAction(userId: string) {
  try {
    const user = await requireActionUser();
    if (!isProductAdmin(user.roles)) {
      throw new Error("アカウントの削除は管理者のみ可能です");
    }
    if (userId === user.id) {
      throw new Error("自分自身のアカウントは削除できません");
    }
    const repo = await getServiceRepository();
    await repo.deleteUserAccount(userId);
    revalidateAccounts();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** アカウントの新規作成(全体管理者のみ)。本番は Supabase Auth ユーザーも作成される。 */
export async function createAccountAction(input: {
  name: string;
  email: string;
  password: string;
  roles: Role[];
}) {
  try {
    const user = await requireActionUser();
    if (!isProductAdmin(user.roles)) {
      throw new Error("アカウント管理は管理者のみ可能です");
    }
    if (!input.name.trim()) throw new Error("名前を入力してください");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      throw new Error("メールアドレスの形式が正しくありません");
    }
    if (input.password.length < 8) {
      throw new Error("パスワードは8文字以上にしてください");
    }
    const roles = validateRoles(input.roles);
    const repo = await getServiceRepository();
    const profile = await repo.createUserAccount({
      name: input.name.trim(),
      email: input.email.trim(),
      password: input.password,
      roles,
    });
    revalidatePath("/settings");
    return { ok: true as const, id: profile.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
