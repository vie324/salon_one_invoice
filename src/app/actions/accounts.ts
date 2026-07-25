"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { ASSIGNABLE_ROLES, isProductAdmin } from "@/lib/domain/constants";
import type { Role } from "@/lib/domain/types";

const assignable = (role: Role) => ASSIGNABLE_ROLES.some((r) => r.value === role);

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
    revalidatePath("/settings");
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
