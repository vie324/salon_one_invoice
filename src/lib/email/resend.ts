import type { EmailMessage, EmailProvider, EmailResult } from "./provider";

/** Resend で実送信するプロバイダ(SDK非依存 / REST 直叩き)。 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    if (!this.apiKey) {
      return { ok: false, message: "RESEND_API_KEY が未設定です（設定 → メール送信 を確認してください）" };
    }
    if (!this.from) {
      return {
        ok: false,
        message: "EMAIL_FROM（送信元アドレス）が未設定です（設定 → メール送信 を確認してください）",
      };
    }

    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
    } catch (e) {
      // ネットワーク到達不可など。呼び出し側で「送信失敗」として扱えるようにする。
      return { ok: false, message: `メールサーバーへ接続できませんでした: ${(e as Error).message}` };
    }

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (!res.ok) {
      // 401=APIキー不正 / 403=送信元ドメイン未認証 が典型
      const hint =
        res.status === 401
          ? "（RESEND_API_KEY を確認してください）"
          : res.status === 403
            ? "（EMAIL_FROM のドメインが Resend で認証済みか確認してください）"
            : "";
      return { ok: false, message: `${json.message ?? `Resend エラー (HTTP ${res.status})`}${hint}` };
    }
    return { ok: true, id: json.id };
  }
}
