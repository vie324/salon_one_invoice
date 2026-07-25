"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { ASSIGNABLE_ROLES, isProductAdmin } from "@/lib/domain/constants";
import type { Role } from "@/lib/domain/types";

const assignable = (role: Role) => ASSIGNABLE_ROLES.some((r) => r.value === role);

/** ロール変更はナビ・ガードに影響するためレイアウトごと再検証する */
function revalidateAccounts() {
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}

/** アカウント種別の変更(全体管理者のみ)。 */
export async function updateUserRoleAction(userId: string, role: Role) {
  try {
    const user = await getCurrentUser();
    if (!isProductAdmin(user.role)) {
      throw new Error("アカウント管理は全体管理者のみ可能です");
    }
    if (!assignable(role)) throw new Error("不正なアカウント種別です");
    if (userId === user.id && role !== "admin") {
      throw new Error("自分自身の全体管理者権限は外せません(他の全体管理者に依頼してください)");
    }
    const repo = await getServiceRepository();
    await repo.updateUserRole(userId, role);
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
    const user = await getCurrentUser();
    if (!user.id) throw new Error("ログインが必要です");
    const repo = await getServiceRepository();
    const profiles = await repo.listUserProfiles();
    if (profiles.some((p) => isProductAdmin(p.role))) {
      throw new Error("既に全体管理者が存在します(既存の全体管理者に種別変更を依頼してください)");
    }
    await repo.updateUserRole(user.id, "admin");
    revalidateAccounts();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** 表示名の変更(本人または全体管理者)。 */
export async function updateAccountNameAction(userId: string, name: string) {
  try {
    const user = await getCurrentUser();
    if (userId !== user.id && !isProductAdmin(user.role)) {
      throw new Error("他のアカウントの変更は全体管理者のみ可能です");
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
    const user = await getCurrentUser();
    if (userId !== user.id && !isProductAdmin(user.role)) {
      throw new Error("他のアカウントのパスワード再設定は全体管理者のみ可能です");
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
    const user = await getCurrentUser();
    if (!isProductAdmin(user.role)) {
      throw new Error("アカウントの削除は全体管理者のみ可能です");
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
  role: Role;
}) {
  try {
    const user = await getCurrentUser();
    if (!isProductAdmin(user.role)) {
      throw new Error("アカウント管理は全体管理者のみ可能です");
    }
    if (!input.name.trim()) throw new Error("名前を入力してください");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      throw new Error("メールアドレスの形式が正しくありません");
    }
    if (input.password.length < 8) {
      throw new Error("パスワードは8文字以上にしてください");
    }
    if (!assignable(input.role)) throw new Error("不正なアカウント種別です");
    const repo = await getServiceRepository();
    const profile = await repo.createUserAccount({
      name: input.name.trim(),
      email: input.email.trim(),
      password: input.password,
      role: input.role,
    });
    revalidatePath("/settings");
    return { ok: true as const, id: profile.id };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
