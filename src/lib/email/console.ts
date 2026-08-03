import type { EmailMessage, EmailProvider, EmailResult } from "./provider";

/** 送信せずログ出力するだけのプロバイダ(開発/デモ用)。 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(message: EmailMessage): Promise<EmailResult> {
    console.info(
      `[email:console] to=${message.to} subject=${message.subject}\n(実送信なし。RESEND_API_KEY + EMAIL_FROM を設定すると実送信になります)`,
    );
    return {
      ok: true,
      id: "console",
      message: "メールは送信していません（プレビューのみ／設定 → メール送信 で実送信に切り替え）",
    };
  }
}
