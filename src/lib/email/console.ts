import type { EmailMessage, EmailProvider, EmailResult } from "./provider";

/** 送信せずログ出力するだけのプロバイダ(開発/デモ用)。 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(message: EmailMessage): Promise<EmailResult> {
    console.info(
      `[email:console] to=${message.to} subject=${message.subject}\n(実送信なし。EMAIL_PROVIDER=resend + RESEND_API_KEY で実送信)`,
    );
    return { ok: true, id: "console", message: "プレビューのみ(未送信)" };
  }
}
