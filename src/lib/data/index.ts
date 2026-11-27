import { isDemoMode, isSupabaseConfigured, supabaseServiceKey } from "@/lib/config";
import { isReadOnlyAccount } from "@/lib/domain/constants";
import { DemoRepository } from "./demo/repository";
import type { Repository } from "./repository";

/**
 * 認証済みスタッフの画面(/(app) 配下)・印刷ページ・CSV API・Server Action 用
 * リポジトリ。デモモード → インメモリ / 本番 → サービスロール(RLSバイパス)。
 *
 * これらの経路は middleware により認証ゲートされており(未ログインは
 * /login へリダイレクトされ、ページもアクションも実行されない)、かつ本アプリは
 * 「認証済みスタッフ = 全データにフルアクセス」という設計のため、ここでは
 * サービスロールで確実に読み書きする。これにより、Next.js の RSC / Server
 * Actions で RLS 用クライアントへセッション(JWT)が伝播せず、書き込みが
 * RLS 違反になったり、読み取りが空になって実在するデータの詳細ページが
 * 「ページが見つかりません」(404) に化ける問題を回避する。
 *
 * SUPABASE_SERVICE_ROLE_KEY 未設定時は、セッションを検証できる場合のみ
 * RLS クライアントにフォールバックする(ローカル開発向け)。検証できない場合は
 * 原因の分からない RLS 違反や偽 404 にせず、設定不備を明示するエラーを投げる。
 *
 * 注意: middleware の認証ゲートを通らない公開ルート(電子契約の署名ページ等)
 * からは使わないこと。それらはトークン等で独自にアクセス制御した上で
 * getJobRepository() を使う。
 */
export async function getServiceRepository(): Promise<Repository> {
  return guardReadOnly(await openServiceRepository());
}

async function openServiceRepository(): Promise<Repository> {
  if (isDemoMode) return new DemoRepository();
  const { SupabaseRepository } = await import("./supabase/repository");
  if (supabaseServiceKey) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    return new SupabaseRepository(createAdminClient());
  }
  // サービスロール未設定時のフォールバック(主にローカル開発)。
  // セッションが RLS クライアントへ伝播する環境でのみ動作する。
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY が未設定のため、データの読み書きができません。" +
        "Vercel(またはサーバー)の環境変数に Supabase の service_role キーを設定してください。",
    );
  }
  return new SupabaseRepository(supabase);
}

/**
 * 閲覧専用のアカウント(税理士の役割だけを持つ社外のアカウント)には、読むだけのリポジトリを渡す。
 * 画面に出していない操作(サーバーアクションの直接呼び出しなど)も含めて、データの変更をすべて断る。
 */
async function guardReadOnly(repo: Repository): Promise<Repository> {
  const { getCurrentUser } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user || !isReadOnlyAccount(user.roles)) return repo;
  return readOnlyRepository(repo);
}

/**
 * 本人のアカウントだけを変える操作(表示名・パスワード)。呼び出すアクション側で
 * 「本人または管理者」を確かめているので、閲覧専用のアカウントにも許す。
 */
const SELF_SERVICE_METHODS = new Set(["updateUserName", "updateAccountPassword"]);

/** 読むだけのメソッド(get / list / count / find で始まるもの)だけを通すリポジトリ */
export function readOnlyRepository(repo: Repository): Repository {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      if (typeof prop === "string" && (/^(get|list|count|find)[A-Z]/.test(prop) || SELF_SERVICE_METHODS.has(prop))) {
        return value.bind(target);
      }
      return () => {
        throw new Error("閲覧専用のアカウントでは、データを変更できません");
      };
    },
  });
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
