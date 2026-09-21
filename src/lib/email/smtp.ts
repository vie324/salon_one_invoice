import type { EmailMessage, EmailProvider, EmailResult } from "./provider";

export interface SmtpOptions {
  host: string;
  port: number;
  /** SMTP 認証のユーザー(Google Workspace のアカウント) */
  user: string;
  password: string;
  /**
   * SMTP AUTH を行うか。
   * false = 認証せずに接続する(送信元IPだけで許可している SMTP リレー向け)。
   * IP許可のリレーに認証情報を送ると 535 で拒否されるため、明示的に分ける。
   */
  useAuth: boolean;
  /** tls=STARTTLS(587) / ssl=SMTPS(465) / none=暗号化なし */
  encryption: "tls" | "ssl" | "none";
  from: string;
}

/** nodemailer の接続設定。送信と接続確認で同じ設定を使う。 */
function transportOptions(o: SmtpOptions) {
  return {
    host: o.host,
    port: o.port,
    // 465 は接続時からTLS、587 は STARTTLS で昇格する
    secure: o.encryption === "ssl",
    requireTLS: o.encryption === "tls",
    ...(o.useAuth ? { auth: { user: o.user, pass: o.password } } : {}),
    // サーバーレスの実行時間内に収める(既定は無制限に近く、障害時に固まる)
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/**
 * SMTP で実送信するプロバイダ。
 * Google Workspace の SMTP リレー(smtp-relay.gmail.com:587)や
 * Gmail の SMTP 送信(smtp.gmail.com:587 + アプリパスワード)を想定。
 *
 * Google の SMTP リレーは認証方法が2通りある。
 *   - SMTP 認証     : どこからでも送れる。MAIL_USERNAME + アプリパスワード(16桁)が必要。
 *   - 送信元IPの制限 : 固定IPの環境からのみ送れる。認証情報は送らない(MAIL_AUTH=none)。
 *
 * nodemailer は Node.js ランタイム専用のため、動的 import でサーバー実行時のみ読み込む。
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  constructor(private options: SmtpOptions) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    const missing = this.missingSetting();
    if (missing) return { ok: false, message: missing };

    try {
      const nodemailer = (await import("nodemailer")).default;
      const transport = nodemailer.createTransport(transportOptions(this.options));

      const info = await transport.sendMail({
        from: this.options.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
      return { ok: true, id: info.messageId };
    } catch (e) {
      return { ok: false, message: smtpErrorMessage(e, this.options) };
    }
  }

  /**
   * メールを送らずに、SMTP サーバーへ接続できるか(認証が通るか)だけを確認する。
   * 送信元IPの許可漏れ・アプリパスワードの誤りを、宛先を用意せずに切り分けられる。
   */
  async verify(): Promise<EmailResult> {
    const missing = this.missingSetting();
    if (missing) return { ok: false, message: missing };

    try {
      const nodemailer = (await import("nodemailer")).default;
      const transport = nodemailer.createTransport(transportOptions(this.options));
      await transport.verify();
      const how = this.options.useAuth
        ? `SMTP 認証（${this.options.user}）で接続できました`
        : "SMTP 認証なし（送信元IPの許可）で接続できました";
      return {
        ok: true,
        message: `${this.options.host}:${this.options.port} に${how}。実際に届くかはテスト送信で確認してください。`,
      };
    } catch (e) {
      return { ok: false, message: smtpErrorMessage(e, this.options) };
    }
  }

  private missingSetting(): string | null {
    const { host, from, useAuth, user, password } = this.options;
    if (!host) return "MAIL_HOST が未設定です（設定 → メール送信 を確認してください）";
    if (!from) {
      return "送信元アドレス（MAIL_FROM_ADDRESS）が未設定です（設定 → メール送信 を確認してください）";
    }
    if (useAuth && (!user || !password)) {
      return "SMTP 認証の MAIL_USERNAME / MAIL_PASSWORD が揃っていません（IP許可だけで送る場合は MAIL_AUTH=none を設定してください）";
    }
    return null;
  }
}

/** SMTP のエラーを、原因と対処が分かる日本語に言い換える。 */
function smtpErrorMessage(e: unknown, o: SmtpOptions): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const raw = err.message ?? String(e);

  // 送信元IPが許可リストに無い / 認証必須（Google の SMTP リレーで最も多い）
  if (err.responseCode === 550 || /5\.7\.1/.test(raw)) {
    const hint = o.useAuth
      ? "Google Workspace の SMTP リレー設定で、この送信元アドレスの送信が許可されているか（送信者: ドメイン内のアドレス）を確認してください"
      : "送信元IPが SMTP リレーの許可リストに登録されているか確認してください。Vercel などサーバーレス環境は送信元IPが固定できないため、リレー設定で「SMTP 認証が必要」を有効にし、MAIL_USERNAME / MAIL_PASSWORD（アプリ パスワード）を設定してください";
    return `送信が拒否されました: ${raw}（${hint}）`;
  }
  if (err.responseCode === 535 || /5\.7\.8|Username and Password not accepted/i.test(raw)) {
    return `認証に失敗しました: ${raw}（MAIL_USERNAME / MAIL_PASSWORD を確認してください。Google では通常のログインパスワードは使えず「アプリ パスワード」（16桁）が必要です。リレーを送信元IPの許可だけで運用している場合は MAIL_AUTH=none を設定して認証を行わないようにしてください）`;
  }
  if (/No identity-like SASL|SMTP AUTH extension|not supported by server/i.test(raw)) {
    return `このSMTPサーバーは認証を受け付けませんでした: ${raw}（送信元IPの許可だけで運用している場合は MAIL_AUTH=none を設定してください）`;
  }
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || err.code === "ESOCKET") {
    return `メールサーバーへ接続できませんでした: ${raw}（MAIL_HOST / MAIL_PORT と、送信元から ${o.port} 番ポートへの通信が許可されているかを確認してください）`;
  }
  if (err.responseCode === 553 || /5\.7\.0|not allowed/i.test(raw)) {
    return `送信元アドレスが許可されていません: ${raw}（MAIL_FROM_ADDRESS のドメインが SMTP リレーの許可対象か確認してください）`;
  }
  if (err.responseCode === 421 || err.responseCode === 454 || /4\.7\.0/.test(raw)) {
    return `一時的に送信を拒否されました: ${raw}（送信数の上限に達していないか確認し、時間をおいて再試行してください）`;
  }
  return `メール送信に失敗しました: ${raw}`;
}
