import type { EmailMessage, EmailProvider, EmailResult } from "./provider";

export interface SmtpOptions {
  host: string;
  port: number;
  /** 空なら SMTP AUTH を行わない(送信元IPで許可するリレー向け) */
  user: string;
  password: string;
  /** tls=STARTTLS(587) / ssl=SMTPS(465) / none=暗号化なし */
  encryption: "tls" | "ssl" | "none";
  from: string;
}

/**
 * SMTP で実送信するプロバイダ。
 * Google Workspace の SMTP リレー(smtp-relay.gmail.com:587)や
 * Gmail の SMTP 送信(smtp.gmail.com:587 + アプリパスワード)を想定。
 *
 * nodemailer は Node.js ランタイム専用のため、動的 import でサーバー実行時のみ読み込む。
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  constructor(private options: SmtpOptions) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    const { host, port, user, password, encryption, from } = this.options;
    if (!host) return { ok: false, message: "MAIL_HOST が未設定です（設定 → メール送信 を確認してください）" };
    if (!from) {
      return {
        ok: false,
        message: "送信元アドレス（MAIL_FROM_ADDRESS）が未設定です（設定 → メール送信 を確認してください）",
      };
    }

    try {
      const nodemailer = (await import("nodemailer")).default;
      const transport = nodemailer.createTransport({
        host,
        port,
        // 465 は接続時からTLS、587 は STARTTLS で昇格する
        secure: encryption === "ssl",
        requireTLS: encryption === "tls",
        ...(user ? { auth: { user, pass: password } } : {}),
        // サーバーレスの実行時間内に収める(既定は無制限に近く、障害時に固まる)
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });

      const info = await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { ok: true, id: info.messageId };
    } catch (e) {
      return { ok: false, message: smtpErrorMessage(e) };
    }
  }
}

/** SMTP のエラーを、原因が分かる日本語に言い換える。 */
function smtpErrorMessage(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const raw = err.message ?? String(e);

  // 送信元IPが許可リストに無い / 認証必須（Google の SMTP リレーで最も多い）
  if (err.responseCode === 550 || /5\.7\.1/.test(raw)) {
    return `送信が拒否されました: ${raw}（Google Workspace の SMTP リレー設定で、送信元IPの制限に加えて「SMTP 認証が必要」を有効にしてください。Vercel は送信元IPが固定できないため、IP制限のみでは送信できません）`;
  }
  if (err.responseCode === 535 || /5\.7\.8|Username and Password not accepted/i.test(raw)) {
    return `認証に失敗しました: ${raw}（MAIL_USERNAME / MAIL_PASSWORD を確認してください。2段階認証を有効にしている場合は通常のパスワードではなく「アプリ パスワード」が必要です）`;
  }
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET") {
    return `メールサーバーへ接続できませんでした: ${raw}（MAIL_HOST / MAIL_PORT と、送信元からの ${"587"} 番ポートの疎通を確認してください）`;
  }
  if (err.responseCode === 553 || /5\.7\.0|not allowed/i.test(raw)) {
    return `送信元アドレスが許可されていません: ${raw}（MAIL_FROM_ADDRESS のドメインが SMTP リレーの許可対象か確認してください）`;
  }
  return `メール送信に失敗しました: ${raw}`;
}
