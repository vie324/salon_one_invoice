import type { EmailMessage, EmailProvider, EmailResult } from "./provider";

/** Resend で実送信するプロバイダ(SDK非依存 / REST 直叩き)。 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    if (!this.apiKey) return { ok: false, message: "RESEND_API_KEY 未設定" };
    const res = await fetch("https://api.resend.com/emails", {
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
    const json = (await res.json()) as { id?: string; message?: string };
    if (!res.ok) return { ok: false, message: json.message ?? "Resend error" };
    return { ok: true, id: json.id };
  }
}
