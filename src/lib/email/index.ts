import {
  appUrl,
  emailFrom,
  emailProvider,
  emailReady,
  invoiceAutoEmail,
  resendApiKey,
} from "@/lib/config";
import { ConsoleEmailProvider } from "./console";
import type { EmailProvider } from "./provider";
import { ResendEmailProvider } from "./resend";

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  cached =
    emailProvider === "resend"
      ? new ResendEmailProvider(resendApiKey, emailFrom)
      : new ConsoleEmailProvider();
  return cached;
}

export interface EmailStatus {
  /** send: 実際にメールを送る / preview: 送らずログ出力のみ */
  mode: "send" | "preview";
  provider: "console" | "resend";
  from: string;
  hasApiKey: boolean;
  /** メール内リンク(署名URL等)の基準URL。未設定ならリクエストヘッダから推定。 */
  appUrl: string;
  /** 定期請求の請求書を自動送付するか */
  invoiceAutoEmail: boolean;
  /** 実送信するために足りない設定(空なら送信可能) */
  issues: string[];
}

/**
 * メール送信の設定状況(設定画面の表示・案内用)。
 * 値そのもの(APIキー)は返さず、設定済みかどうかだけを返す。
 */
export function getEmailStatus(): EmailStatus {
  const issues: string[] = [];
  if (emailProvider !== "resend") {
    issues.push("RESEND_API_KEY が未設定です（プレビューのみで、実際には送信されません）");
  } else {
    if (!resendApiKey) issues.push("RESEND_API_KEY が未設定です");
    if (!emailFrom) {
      issues.push("EMAIL_FROM（送信元アドレス）が未設定です。Resend で認証したドメインを指定してください");
    }
  }
  if (!appUrl) {
    issues.push(
      "NEXT_PUBLIC_APP_URL が未設定です。署名・請求書リンクは実行環境のURLから推定されます（本番URLの設定を推奨）",
    );
  }
  return {
    mode: emailReady ? "send" : "preview",
    provider: emailProvider,
    from: emailFrom,
    hasApiKey: !!resendApiKey,
    appUrl,
    invoiceAutoEmail,
    issues,
  };
}

export type { EmailProvider, EmailMessage, EmailResult } from "./provider";
