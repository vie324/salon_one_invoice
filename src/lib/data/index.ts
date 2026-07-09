import { isDemoMode } from "@/lib/config";
import { DemoRepository } from "./demo/repository";
import type { Repository } from "./repository";

/**
 * リクエスト用リポジトリを取得。
 * デモモード → インメモリ / それ以外 → Supabase(RLS適用のサーバークライアント)。
 */
export async function getRepository(): Promise<Repository> {
  if (isDemoMode) return new DemoRepository();
  const { createClient } = await import("@/lib/supabase/server");
  const { SupabaseRepository } = await import("./supabase/repository");
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
