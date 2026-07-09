import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/config";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** サーバー(RSC/Server Action/Route Handler)用 Supabase クライアント。RLS が適用される。 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component から呼ばれた場合は無視（middleware がセッションを更新する）
        }
      },
    },
  });
}
