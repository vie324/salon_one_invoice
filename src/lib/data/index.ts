import { isDemoMode, supabaseServiceKey } from "@/lib/config";
import { DemoRepository } from "./demo/repository";
import type { Repository } from "./repository";

/**
 * リクエスト用リポジトリを取得（認証済みスタッフの画面・操作向け）。
 * デモモード → インメモリ。
 * 本番(Supabase) → ログイン中のユーザーを検証したうえで、
 *   サービスロールのクライアントを使う。
 *
 * 本アプリは「認証済みスタッフ = 全データにフルアクセス」という設計
 * (RLS も authenticated には全許可)。一方で Next.js の Server Actions では
 * RLS 用クライアントへセッション(JWT)が確実に伝播しないケースがあり、
 * 読み取りは空・書き込みは RLS 違反になることがある。そこで、
 * サーバー側で有効なログインを確認してからサービスロールで読み書きし、
 * 動作を安定させる(未ログイン時は RLS クライアントにフォールバック)。
 */
export async function getRepository(): Promise<Repository> {
  if (isDemoMode) return new DemoRepository();
  const { SupabaseRepository } = await import("./supabase/repository");
  const { createClient } = await import("@/lib/supabase/server");

  // サービスロール未設定なら従来どおり RLS クライアント。
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
 * サーバー専用ジョブ(cron/webhook)用リポジトリ。
 * デモモード → インメモリ / それ以外 → Supabase(サービスロール, RLSバイパス)。
 */
export async function getJobRepository(): Promise<Repository> {
  if (isDemoMode) return new DemoRepository();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { SupabaseRepository } = await import("./supabase/repository");
  return new SupabaseRepository(createAdminClient());
}

export type { Repository } from "./repository";
