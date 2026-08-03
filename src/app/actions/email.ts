"use server";

import { requireActionUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";
import { getEmailProvider } from "@/lib/email";
import { testEmailHtml } from "@/lib/email/templates";
import { isProductAdmin } from "@/lib/domain/constants";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * メール設定の確認用テスト送信。
 * 実送信の設定(RESEND_API_KEY / EMAIL_FROM)が正しいかを、
 * お客様宛のメールを出す前に自分のアドレスで確認するためのもの。
 * 外部への送信を伴うため全体管理者のみ実行できる。
 */
export async function sendTestEmailAction(to: string) {
  try {
    const user = await requireActionUser();
    if (!isProductAdmin(user.role)) {
      return { ok: false as const, error: "テスト送信は全体管理者のみ実行できます" };
    }
    const address = to.trim();
    if (!EMAIL_RE.test(address)) {
      return { ok: false as const, error: "メールアドレスの形式が正しくありません" };
    }

    const repo = await getServiceRepository();
    const org = await repo.getOrganization();
    const provider = getEmailProvider();
    const sentAt = new Date().toISOString();
    const res = await provider.send({
      to: address,
      subject: `【${org.name}】メール送信テスト`,
      html: testEmailHtml({ org, actor: user.name, sentAt }),
      text: `【${org.name}】メール送信テスト\nこのメールが届いていれば、契約・請求のメールを実際に送信できる状態です。`,
    });

    if (!res.ok) {
      return { ok: false as const, error: res.message ?? "送信に失敗しました" };
    }
    return {
      ok: true as const,
      sent: provider.name === "resend",
      message:
        provider.name === "resend"
          ? `${address} 宛にテストメールを送信しました。数分待っても届かない場合は迷惑メールフォルダもご確認ください。`
          : (res.message ?? "プレビューのみで、メールは送信されていません"),
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
