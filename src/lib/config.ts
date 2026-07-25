/**
 * アプリ設定 — 環境変数から実行モードを判定する。
 * Supabase の環境変数が無い場合は「デモモード」で動作し、
 * インメモリのサンプルデータを使用する（誰でもすぐ触れる）。
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Supabase が設定済みか（= 本番/実DBモード） */
export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

/** デモモード（Supabase 未設定） */
export const isDemoMode = !isSupabaseConfigured;

export const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "SalonOne";

/** 決済プロバイダ: manual(手動/CSV) | stripe */
export const paymentProvider = (process.env.PAYMENT_PROVIDER ?? "manual") as
  | "manual"
  | "stripe";

/** メールプロバイダ: console(プレビュー) | resend */
export const emailProvider = (process.env.EMAIL_PROVIDER ?? "console") as
  | "console"
  | "resend";

export const cronSecret = process.env.CRON_SECRET ?? "";

/** 署名リンク等の絶対URL生成に使う。未設定時はリクエストヘッダから推定。 */
export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

/** 定期請求の自動生成時に請求書メールも自動送付するか(既定: 有効) */
export const invoiceAutoEmail =
  (process.env.INVOICE_AUTO_EMAIL ?? "true").toLowerCase() !== "false";

/** AIモック生成(Claude API)。未設定時はデモ用サンプル生成のみ */
export const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
export const anthropicModel = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
