import { isDemoMode, isSupabaseConfigured, supabaseServiceKey } from "@/lib/config";
import { DemoRepository } from "./demo/repository";
import type { Repository } from "./repository";

/**
 * サーバーコンポーネント(画面)用リポジトリ。
 * デモモード → インメモリ。
 * 本番(Supabase) → ログイン中のユーザーを検証できればサービスロール、
 *   できなければ RLS クライアント。
 *
 * 画面の一部(公開の印刷ページ /print や CSV API)は未認証でも到達しうるため、
 * ここでは必ず認証を確認し、未認証時は RLS クライアントに退避して
 * データが漏れないようにする。書き込みを伴うスタッフ操作は
 * getServiceRepository() を使うこと。
 */
export async function getRepository(): Promise<Repository> {
  if (isDemoMode) return new DemoRepository();
  const { SupabaseRepository } = await import("./supabase/repository");
  const { createClient } = await import("@/lib/supabase/server");

  if (supabaseServiceKey) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      return new SupabaseRepository(createAdminClient());
    }
  }
  return new SupabaseRepository(await createClient());
}

/**
 * 認証済みスタッフの操作(Server Action)用リポジトリ。
 * デモモード → インメモリ / 本番 → サービスロール(RLSバイパス)。
 *
 * Server Actions は middleware により認証ゲートされており(未ログインは
 * /login へリダイレクトされ、アクション本体は実行されない)、かつ本アプリは
 * 「認証済みスタッフ = 全データにフルアクセス」という設計のため、ここでは
 * サービスロールで確実に読み書きする。これにより、Next.js の Server Actions で
 * RLS 用クライアントへセッション(JWT)が伝播せず書き込みが RLS 違反になる問題を
 * 回避する。サービスロール未設定時のみ RLS クライアントにフォールバックする。
 */
export async function getServiceRepository(): Promise<Repository> {
  if (isDemoMode) return new DemoRepository();
  const { SupabaseRepository } = await import("./supabase/repository");
  if (supabaseServiceKey) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return new SupabaseRepository(createAdminClient());
  }
  // サービスロール未設定時は RLS クライアント(要ログイン)にフォールバック
  const { createClient } = await import("@/lib/supabase/server");
  return new SupabaseRepository(await createClient());
}

/** Supabase 設定済みか(UI からの状態表示・警告用に再エクスポート) */
export { isSupabaseConfigured };

/**
 * サーバー専用ジョブ(cron/webhook/公開署名ページ)用リポジトリ。
 * デモモード → インメモリ / それ以外 → Supabase(サービスロール, RLSバイパス)。
 */
export async function getJobRepository(): Promise<Repository> {
  if (isDemoMode) return new DemoRepository();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { SupabaseRepository } = await import("./supabase/repository");
  return new SupabaseRepository(createAdminClient());
}

export type { Repository } from "./repository";
