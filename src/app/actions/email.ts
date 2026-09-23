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
    if (!isProductAdmin(user.roles)) {
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
    // console 以外(SMTP / Resend)は実際に送信している
    const sent = provider.name !== "console";
    return {
      ok: true as const,
      sent,
      message: sent
        ? `${address} 宛にテストメールを送信しました。数分待っても届かない場合は迷惑メールフォルダもご確認ください。`
        : (res.message ?? "プレビューのみで、メールは送信されていません"),
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/**
 * メールを送らずに SMTP サーバーへの接続・認証だけを確認する。
 * 「送信元IPが許可されていない」「アプリ パスワードが違う」を、
 * 宛先を用意せずに切り分けるための診断。
 */
export async function checkEmailConnectionAction() {
  try {
    const user = await requireActionUser();
    if (!isProductAdmin(user.roles)) {
      return { ok: false as const, error: "接続確認は全体管理者のみ実行できます" };
    }

    const provider = getEmailProvider();
    if (!provider.verify) {
      return {
        ok: false as const,
        error:
          provider.name === "console"
            ? "メール送信が未設定です（プレビューのみ）。MAIL_HOST などを設定してください"
            : "この送信方法では接続確認に対応していません（SMTP のみ）",
      };
    }

    const res = await provider.verify();
    if (!res.ok) {
      return { ok: false as const, error: res.message ?? "接続できませんでした" };
    }
    return { ok: true as const, message: res.message ?? "接続できました" };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}
