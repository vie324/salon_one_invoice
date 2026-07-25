import type { UserProfile } from "@/lib/domain/types";
import { buildSeed, DEMO_PROFILES, demoProfileIdForRole, type DataStore } from "./seed";

/**
 * デモ用インメモリストアのシングルトン。
 * dev サーバーのプロセス内では HMR をまたいで保持される。
 * (本番デプロイで永続化が必要な場合は Supabase を設定すること)
 */
const globalForStore = globalThis as unknown as { __demoStore?: DataStore };

export function getStore(): DataStore {
  if (!globalForStore.__demoStore) {
    globalForStore.__demoStore = buildSeed();
  }
  return globalForStore.__demoStore;
}

/**
 * デモモードの現在アカウント。cookie のロール → 固定ペルソナID → ストアの
 * プロフィール(設定でロールを変更した場合も反映)の順で解決する。
 */
export function getDemoProfile(roleCookie: string | undefined): UserProfile {
  const id = demoProfileIdForRole(roleCookie);
  const store = getStore();
  return (
    store.profiles.find((p) => p.id === id) ??
    DEMO_PROFILES.find((p) => p.id === id) ??
    DEMO_PROFILES[0]
  );
}

/** テスト/デモのリセット用 */
export function resetStore(): void {
  globalForStore.__demoStore = buildSeed();
}
