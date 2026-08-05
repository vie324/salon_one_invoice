import {
  appUrl,
  emailFrom,
  emailProvider,
  emailReady,
  invoiceAutoEmail,
  resendApiKey,
  smtpEncryption,
  smtpHost,
  smtpPassword,
  smtpPort,
  smtpUser,
} from "@/lib/config";
import { ConsoleEmailProvider } from "./console";
import type { EmailProvider } from "./provider";
import { ResendEmailProvider } from "./resend";
import { SmtpEmailProvider } from "./smtp";

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  if (emailProvider === "smtp") {
    cached = new SmtpEmailProvider({
      host: smtpHost,
      port: smtpPort,
      user: smtpUser,
      password: smtpPassword,
      encryption: smtpEncryption,
      from: emailFrom,
    });
  } else if (emailProvider === "resend") {
    cached = new ResendEmailProvider(resendApiKey, emailFrom);
  } else {
    cached = new ConsoleEmailProvider();
  }
  return cached;
}

export interface EmailStatus {
  /** send: 実際にメールを送る / preview: 送らずログ出力のみ */
  mode: "send" | "preview";
  provider: "console" | "smtp" | "resend";
  /** 画面表示用のプロバイダ名 */
  providerLabel: string;
  from: string;
  /** SMTP の接続先(SMTP 利用時のみ) */
  smtp: { host: string; port: number; user: string; encryption: string; hasAuth: boolean } | null;
  hasApiKey: boolean;
  /** メール内リンク(署名URL等)の基準URL。未設定ならリクエストヘッダから推定。 */
  appUrl: string;
  /** 定期請求の請求書を自動送付するか */
  invoiceAutoEmail: boolean;
  /** 実送信するために足りない設定(空なら送信可能) */
  issues: string[];
  /** 設定は揃っているが注意が必要な点 */
  warnings: string[];
}

/**
 * メール送信の設定状況(設定画面の表示・案内用)。
 * 値そのもの(APIキー・パスワード)は返さず、設定済みかどうかだけを返す。
 */
export function getEmailStatus(): EmailStatus {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (emailProvider === "smtp") {
    if (!smtpHost) issues.push("MAIL_HOST が未設定です");
    if (!emailFrom) {
      issues.push("MAIL_FROM_ADDRESS（送信元アドレス）が未設定です");
    }
    if (!smtpUser) {
      // Google の SMTP リレーを送信元IPだけで許可している場合、Vercel からは送れない
      warnings.push(
        "SMTP 認証（MAIL_USERNAME / MAIL_PASSWORD）が未設定です。送信元IPの制限だけで運用している場合、Vercel は送信元IPが固定できないため送信が拒否されます。SMTP リレー側で「SMTP 認証が必要」を有効にしてください。",
      );
    }
  } else if (emailProvider === "resend") {
    if (!resendApiKey) issues.push("RESEND_API_KEY が未設定です");
    if (!emailFrom) {
      issues.push("EMAIL_FROM（送信元アドレス）が未設定です。Resend で認証したドメインを指定してください");
    }
  } else {
    issues.push(
      "メール送信の設定がありません（プレビューのみで、実際には送信されません）。SMTP の場合は MAIL_HOST を設定してください",
    );
  }

  if (!appUrl) {
    issues.push(
      "NEXT_PUBLIC_APP_URL が未設定です。署名・請求書リンクは実行環境のURLから推定されます（本番URLの設定を推奨）",
    );
  }

  return {
    mode: emailReady ? "send" : "preview",
    provider: emailProvider,
    providerLabel:
      emailProvider === "smtp" ? "SMTP" : emailProvider === "resend" ? "Resend" : "プレビュー",
    from: emailFrom,
    smtp:
      emailProvider === "smtp"
        ? {
            host: smtpHost,
            port: smtpPort,
            user: smtpUser,
            encryption: smtpEncryption,
            hasAuth: !!smtpUser && !!smtpPassword,
          }
        : null,
    hasApiKey: !!resendApiKey,
    appUrl,
    invoiceAutoEmail,
    issues,
    warnings,
  };
}

export type { EmailProvider, EmailMessage, EmailResult } from "./provider";
