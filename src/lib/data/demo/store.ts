import { buildSeed, type DataStore } from "./seed";

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

/** テスト/デモのリセット用 */
export function resetStore(): void {
  globalForStore.__demoStore = buildSeed();
}
