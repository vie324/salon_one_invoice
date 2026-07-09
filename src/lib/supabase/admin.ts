import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceKey, supabaseUrl } from "@/lib/config";

/**
 * サービスロールクライアント（RLS をバイパス）。
 * cron / webhook などサーバー専用処理でのみ使用すること。クライアントへ露出禁止。
 */
export function createAdminClient() {
  return createSupabaseClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
