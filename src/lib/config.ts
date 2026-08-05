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

/** Resend の API キー(Resend 利用時に必須) */
export const resendApiKey = process.env.RESEND_API_KEY ?? "";

/* ---- SMTP (Google Workspace の SMTP リレー等) ---- */

/** SMTP サーバー(例: smtp-relay.gmail.com) */
export const smtpHost = process.env.MAIL_HOST ?? "";
export const smtpPort = Number(process.env.MAIL_PORT ?? 587) || 587;
/** SMTP 認証のユーザー。空ならAUTHなし(送信元IPで許可するリレー向け)。 */
export const smtpUser = process.env.MAIL_USERNAME ?? "";
export const smtpPassword = process.env.MAIL_PASSWORD ?? "";
/**
 * tls  = 587 で STARTTLS(平文接続 → TLSへ昇格。Google のリレーはこれ)
 * ssl  = 465 で最初からTLS
 * none = 暗号化なし(社内リレー等。非推奨)
 */
export const smtpEncryption = (process.env.MAIL_ENCRYPTION ?? "tls").trim().toLowerCase() as
  | "tls"
  | "ssl"
  | "none";

/**
 * 送信元アドレス(例: `請求 <billing@example.jp>`)。実送信に必須。
 * SMTP 利用時は MAIL_FROM_ADDRESS / MAIL_FROM_NAME からも組み立てられる。
 */
const mailFromAddress = process.env.MAIL_FROM_ADDRESS ?? "";
const mailFromName = process.env.MAIL_FROM_NAME ?? "";
export const emailFrom =
  process.env.EMAIL_FROM ??
  (mailFromAddress ? (mailFromName ? `${mailFromName} <${mailFromAddress}>` : mailFromAddress) : "");

/**
 * メールプロバイダ: console(未送信のプレビュー) | smtp(実送信) | resend(実送信)
 *
 * 明示指定が無くても、設定済みの値から自動で判定する。
 * (キーやホストだけ設定して「送ったつもりで送られていない」事故を防ぐ。
 *  意図的にプレビューへ戻す場合は EMAIL_PROVIDER=console を明示する)
 */
const emailProviderEnv = (process.env.EMAIL_PROVIDER ?? process.env.MAIL_MAILER ?? "")
  .trim()
  .toLowerCase();
export const emailProvider: "console" | "smtp" | "resend" =
  emailProviderEnv === "smtp"
    ? "smtp"
    : emailProviderEnv === "resend"
      ? "resend"
      : emailProviderEnv === "console"
        ? "console"
        : smtpHost
          ? "smtp"
          : resendApiKey
            ? "resend"
            : "console";

/** 実送信の設定が揃っているか */
export const emailReady =
  emailProvider === "smtp"
    ? !!smtpHost && !!emailFrom
    : emailProvider === "resend"
      ? !!resendApiKey && !!emailFrom
      : false;

export const cronSecret = process.env.CRON_SECRET ?? "";

/** 署名リンク等の絶対URL生成に使う。未設定時はリクエストヘッダから推定。 */
export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

/** 定期請求の自動生成時に請求書メールも自動送付するか(既定: 有効) */
export const invoiceAutoEmail =
  (process.env.INVOICE_AUTO_EMAIL ?? "true").toLowerCase() !== "false";

/** AIモック生成(Claude API)。未設定時はデモ用サンプル生成のみ */
export const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
export const anthropicModel = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
