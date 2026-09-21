import {
  appUrl,
  emailFrom,
  emailFromAddress,
  emailProvider,
  emailReady,
  invoiceAutoEmail,
  isServerlessRuntime,
  resendApiKey,
  smtpAuthMode,
  smtpEncryption,
  smtpHost,
  smtpPassword,
  smtpPort,
  smtpUseAuth,
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
      useAuth: smtpUseAuth,
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
  smtp: {
    host: string;
    port: number;
    user: string;
    encryption: string;
    /** SMTP 認証を行うか(false = 送信元IPの許可で送る) */
    hasAuth: boolean;
    /** 画面表示用の認証方式 */
    authLabel: string;
  } | null;
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

/** Google の SMTP サーバー(リレー / Gmail)か */
function isGoogleSmtp(host: string): boolean {
  return /(^|\.)(gmail|google)\.com$/i.test(host.trim());
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

    if (smtpUseAuth) {
      // Google は通常のログインパスワードを受け付けない(アプリ パスワードは16桁)
      if (isGoogleSmtp(smtpHost) && smtpPassword.replace(/\s/g, "").length !== 16) {
        warnings.push(
          "MAIL_PASSWORD が Google の「アプリ パスワード」（空白を除いて16桁）の形式ではありません。通常のログインパスワードでは SMTP 認証は通りません（対象アカウントで2段階認証を有効にしてアプリ パスワードを発行してください）。",
        );
      }
      if (
        emailFromAddress &&
        smtpUser &&
        emailFromAddress.split("@")[1]?.toLowerCase() !== smtpUser.split("@")[1]?.toLowerCase()
      ) {
        warnings.push(
          `送信元アドレス（${emailFromAddress}）と SMTP 認証アカウント（${smtpUser}）のドメインが異なります。SMTP リレーの「送信者」設定で許可されていないと拒否されます。`,
        );
      }
    } else if (isServerlessRuntime) {
      // 送信元IPを固定できない環境では、IP許可だけのリレーには送信できない
      issues.push(
        `${
          smtpAuthMode === "none"
            ? "MAIL_AUTH=none（SMTP 認証なし）で動作しています"
            : "SMTP 認証（MAIL_USERNAME / MAIL_PASSWORD）が設定されていません"
        }。Vercel は送信元IPが固定できないため、SMTP リレーを「送信元IPの制限」だけで運用していると送信は拒否されます。Google 管理コンソールの SMTP リレー設定で「SMTP 認証が必要」を有効にし、MAIL_USERNAME とアプリ パスワード（MAIL_PASSWORD）を設定してください。`,
      );
    } else {
      // 認証なし = 送信元IPの許可だけで送るリレー構成
      if (smtpAuthMode === "none" && (smtpUser || smtpPassword)) {
        warnings.push(
          "MAIL_AUTH=none のため、MAIL_USERNAME / MAIL_PASSWORD は使用されません（送信元IPの許可だけで送信します）。",
        );
      } else if (smtpUser || smtpPassword) {
        warnings.push(
          "MAIL_USERNAME と MAIL_PASSWORD の両方が揃っていないため、SMTP 認証は行いません（送信元IPの許可だけで送信します）。",
        );
      }
      warnings.push(
        "SMTP 認証を行いません。このサーバーのグローバルIPアドレスが、Google 管理コンソールの SMTP リレー設定の許可IPに登録されている必要があります（IPが変わると送信できなくなります）。",
      );
    }

    if (isGoogleSmtp(smtpHost) && smtpEncryption === "none") {
      warnings.push(
        "MAIL_ENCRYPTION=none になっています。Google の SMTP リレーは TLS が必要です（587 なら tls、465 なら ssl）。",
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
            hasAuth: smtpUseAuth,
            authLabel: smtpUseAuth
              ? `SMTP 認証（${smtpUser}）`
              : "認証なし（送信元IPの許可で送信）",
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
