export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailResult {
  ok: boolean;
  id?: string;
  message?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
  /**
   * メールを送らずに接続(と認証)だけを確認する。
   * 送信元IPの許可漏れやパスワード誤りの切り分け用。対応しないプロバイダでは未実装。
   */
  verify?(): Promise<EmailResult>;
}
