import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/config";

/** ブラウザ用 Supabase クライアント */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
