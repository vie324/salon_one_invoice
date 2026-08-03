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

/** Resend の API キー(実送信に必須) */
export const resendApiKey = process.env.RESEND_API_KEY ?? "";

/** 送信元アドレス(例: `請求 <billing@example.jp>`)。実送信に必須。 */
export const emailFrom = process.env.EMAIL_FROM ?? "";

/**
 * メールプロバイダ: console(未送信のプレビュー) | resend(実送信)
 *
 * EMAIL_PROVIDER が未設定でも RESEND_API_KEY があれば実送信にする。
 * (キーだけ設定して「送ったつもりで送られていない」事故を防ぐ。
 *  意図的にプレビューへ戻す場合は EMAIL_PROVIDER=console を明示する)
 */
const emailProviderEnv = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
export const emailProvider: "console" | "resend" =
  emailProviderEnv === "resend"
    ? "resend"
    : emailProviderEnv === "console"
      ? "console"
      : resendApiKey
        ? "resend"
        : "console";

/** 実送信の設定が揃っているか(プロバイダ・APIキー・送信元) */
export const emailReady = emailProvider === "resend" && !!resendApiKey && !!emailFrom;

export const cronSecret = process.env.CRON_SECRET ?? "";

/** 署名リンク等の絶対URL生成に使う。未設定時はリクエストヘッダから推定。 */
export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

/** 定期請求の自動生成時に請求書メールも自動送付するか(既定: 有効) */
export const invoiceAutoEmail =
  (process.env.INVOICE_AUTO_EMAIL ?? "true").toLowerCase() !== "false";

/** AIモック生成(Claude API)。未設定時はデモ用サンプル生成のみ */
export const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
export const anthropicModel = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
