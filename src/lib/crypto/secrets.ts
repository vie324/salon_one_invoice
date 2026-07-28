import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * 預かった外部サービスの認証情報(ID・パスワード)の暗号化。
 *
 * お客様の HPB / minimo / EPARK のログイン情報は平文で保存せず、
 * AES-256-GCM で暗号化して保管する(鍵はサーバー側の環境変数のみに存在し、
 * DB には保存しない)。復号は連携作業を行う担当者の操作時のみ行う。
 *
 * 鍵の決め方(上から順に採用):
 *   1. APP_ENCRYPTION_KEY        … 専用鍵(推奨)
 *   2. SUPABASE_SERVICE_ROLE_KEY … 未設定時のフォールバック(サーバー専用の秘密)
 *   3. デモモードの固定鍵        … インメモリのデモデータ用
 *
 * ※ 鍵を変更・ローテーションすると、それ以前に保存した認証情報は復号できなく
 *    なる(その場合はお客様に再入力を依頼する)。
 */

const PREFIX = "v1";

function keyMaterial(): string {
  const explicit = process.env.APP_ENCRYPTION_KEY;
  if (explicit) return explicit;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) return serviceKey;
  // デモモード(Supabase 未設定)。データはインメモリのみで永続化されない。
  return "salon-one-demo-encryption-key";
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(keyMaterial()).digest();
}

/** 文字列を暗号化する。空文字は null(未入力)として扱う。 */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/**
 * 暗号化された文字列を復号する。
 * 鍵の変更などで復号できない場合は null を返す(画面には「復号できません」と表示)。
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

/** 表示用のマスク(先頭2文字だけ残す)。 */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 2) return "••••";
  return value.slice(0, 2) + "••••••";
}

/** 連携情報(ID・パスワード)を暗号化する。未入力なら null。 */
export function encryptCredential(
  cred: { loginId: string; password: string } | null | undefined,
): { loginId: string; password: string } | null {
  if (!cred || (!cred.loginId && !cred.password)) return null;
  return {
    loginId: encryptSecret(cred.loginId) ?? "",
    password: encryptSecret(cred.password) ?? "",
  };
}

/**
 * 暗号化済みの連携情報を「マスク表示用」に変換する。
 * 画面には既定でこちらを渡し、平文は「表示」操作時のみ復号する。
 */
export function maskCredential(
  cred: { loginId: string | null; password: string | null } | null,
): { loginId: string; password: string } | null {
  if (!cred) return null;
  return {
    loginId: maskSecret(decryptSecret(cred.loginId)),
    password: maskSecret(decryptSecret(cred.password)),
  };
}

/** 暗号化済みの連携情報を復号する(復号できない項目は空文字)。 */
export function revealCredential(
  cred: { loginId: string | null; password: string | null } | null,
): { loginId: string; password: string } | null {
  if (!cred) return null;
  return {
    loginId: decryptSecret(cred.loginId) ?? "",
    password: decryptSecret(cred.password) ?? "",
  };
}
