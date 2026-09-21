#!/usr/bin/env node
/**
 * メール送信設定の疎通確認 CLI。
 *
 *   node scripts/mail-test.mjs                # 接続・認証の確認だけ（メールは送らない）
 *   node scripts/mail-test.mjs you@example.jp # 上記に加えてテストメールを1通送る
 *
 * `.env.local` →`.env` の順に読み込み（既存の環境変数が優先）、
 * このサーバーのグローバルIPも表示する。
 * Google Workspace の SMTP リレーを「送信元IPの制限」で使う場合、
 * ここで表示されたIPを管理コンソールの許可リストに登録する。
 */
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

/** .env 形式のファイルを読み、未設定の環境変数だけを補う。 */
function loadEnvFile(file) {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return false;
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let value = m[2].trim();
    // 引用符で囲まれていない値の行末コメントだけを取り除く
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return true;
}

for (const f of [".env.local", ".env"]) {
  if (loadEnvFile(f)) console.log(`読み込み: ${f}`);
}

const host = process.env.MAIL_HOST ?? "";
const port = Number(process.env.MAIL_PORT ?? 587) || 587;
const encryption = (process.env.MAIL_ENCRYPTION ?? "tls").trim().toLowerCase();
const user = process.env.MAIL_USERNAME ?? "";
const password = process.env.MAIL_PASSWORD ?? "";
const authMode = (process.env.MAIL_AUTH ?? "auto").trim().toLowerCase();
const useAuth = authMode !== "none" && !!user && !!password;
const fromAddress = process.env.MAIL_FROM_ADDRESS ?? "";
const fromName = process.env.MAIL_FROM_NAME ?? "";
const from =
  process.env.EMAIL_FROM ?? (fromName && fromAddress ? `${fromName} <${fromAddress}>` : fromAddress);

if (!host) {
  console.error("MAIL_HOST が未設定です。.env.local に SMTP の設定を書いてから実行してください。");
  process.exit(1);
}
if (!from) {
  console.error("MAIL_FROM_ADDRESS（送信元アドレス）が未設定です。");
  process.exit(1);
}

/** このサーバーのグローバルIP（SMTP リレーの許可リストに登録するアドレス） */
async function globalIp() {
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(5000),
    });
    return (await res.json()).ip;
  } catch {
    return "取得できませんでした";
  }
}

const to = process.argv[2];

console.log("--- メール設定 ---");
console.log(`SMTPサーバー : ${host}:${port} (${encryption})`);
console.log(`認証         : ${useAuth ? `あり (${user})` : "なし（送信元IPの許可で送信）"}`);
if (useAuth) {
  const len = password.replace(/\s/g, "").length;
  console.log(`パスワード   : ${"*".repeat(Math.min(len, 16))} (${len}桁)${len === 16 ? "" : " ← Google のアプリ パスワードは16桁です"}`);
}
console.log(`送信元       : ${from}`);
console.log(`このサーバーのグローバルIP : ${await globalIp()}`);

const transport = nodemailer.createTransport({
  host,
  port,
  secure: encryption === "ssl",
  requireTLS: encryption === "tls",
  ...(useAuth ? { auth: { user, pass: password } } : {}),
  connectionTimeout: 15_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
});

try {
  console.log("\n--- 接続確認 ---");
  await transport.verify();
  console.log("OK: SMTPサーバーへ接続できました。");
} catch (e) {
  console.error(`NG: ${e.message}`);
  console.error(
    "  5.7.1 / 550 → 送信元IPが許可リストにありません（上のグローバルIPを Google 管理コンソールに登録）\n" +
      "  5.7.8 / 535 → 認証エラー（アプリ パスワード16桁を確認。IP許可だけで送るなら MAIL_AUTH=none）\n" +
      "  ETIMEDOUT   → このサーバーから " + port + " 番ポートへ出られません（ファイアウォール/OP25B）",
  );
  process.exit(1);
}

if (!to) {
  console.log("\n宛先を指定すると、テストメールを1通送信します: node scripts/mail-test.mjs you@example.jp");
  process.exit(0);
}

try {
  console.log(`\n--- テスト送信 → ${to} ---`);
  const info = await transport.sendMail({
    from,
    to,
    subject: "【SalonOne】メール送信テスト",
    text: `このメールが届いていれば、${host} 経由でシステムからメールを送信できる状態です。\n送信元: ${from}\n送信日時: ${new Date().toLocaleString("ja-JP")}`,
  });
  console.log(`OK: 送信しました (messageId: ${info.messageId})`);
  console.log("届かない場合は迷惑メールフォルダと、SPF/DKIM の設定を確認してください。");
} catch (e) {
  console.error(`NG: ${e.message}`);
  process.exit(1);
}
