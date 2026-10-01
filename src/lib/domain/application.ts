import type { Application, ApplicationLink, ServiceCredential } from "./types";
import { APPLICATION_SERVICES } from "./constants";

/**
 * 申込用URL(お客様に渡すフォーム)の共通ロジック。
 * サーバー・クライアントの双方から利用するため node の API は使わない。
 */

/** 申込URLの受付可否 */
export type ApplicationLinkAvailability = "ok" | "inactive" | "expired";

/** 申込URL用トークン(暗号乱数 24バイト = 48hex) */
export function generateApplicationToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 停止・期限切れを判定する。 */
export function applicationLinkAvailability(
  link: Pick<ApplicationLink, "active" | "expiresAt">,
  now: Date = new Date(),
): ApplicationLinkAvailability {
  if (!link.active) return "inactive";
  if (link.expiresAt && new Date(link.expiresAt).getTime() < now.getTime()) return "expired";
  return "ok";
}

/** お客様に渡すURL。base は https://example.com のような絶対URL。 */
export function applicationFormUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/apply/${token}`;
}

/**
 * URLの種類(一覧のバッジ・発行画面の説明に使う)。
 * - contract: お客様ごとの申込＋契約URL(標準)
 * - agency:   代理店に渡す常設URL(相談の入口つき・何件でも受付)
 * - referral: 紹介・問い合わせから発行したURL
 * - application_only: 申込のみ(契約書は後から送付する旧来の形)
 */
export type ApplicationLinkKind = "contract" | "agency" | "referral" | "application_only";

export function applicationLinkKind(
  link: Pick<ApplicationLink, "withContract" | "agencyId" | "referralId">,
): ApplicationLinkKind {
  if (!link.withContract) return "application_only";
  if (link.referralId) return "referral";
  if (link.agencyId) return "agency";
  return "contract";
}

export const applicationLinkKindLabels: Record<ApplicationLinkKind, string> = {
  contract: "申込＋契約",
  agency: "代理店URL",
  referral: "紹介から",
  application_only: "申込のみ",
};

export const applicationLinkKindTone: Record<ApplicationLinkKind, "primary" | "warning" | "info" | "neutral"> = {
  contract: "primary",
  agency: "warning",
  referral: "info",
  application_only: "neutral",
};

/** 連携情報が入力されているか(ID・パスワードのどちらかがあれば申込ありとみなす) */
export function hasCredential(cred: ServiceCredential | null | undefined): boolean {
  return Boolean(cred && (cred.loginId || cred.password));
}

/** 入力値を ServiceCredential に整える(両方空なら null = 申込なし)。 */
export function toCredential(
  loginId: string | null | undefined,
  password: string | null | undefined,
): ServiceCredential | null {
  const id = (loginId ?? "").trim();
  const pw = (password ?? "").trim();
  if (!id && !pw) return null;
  return { loginId: id, password: pw };
}

/** 申込で希望された連携の一覧(表示名)。 */
export function requestedServices(app: Application): string[] {
  const names: string[] = APPLICATION_SERVICES.filter((s) => hasCredential(app[s.key])).map(
    (s) => s.label,
  );
  if (app.lineRequested) names.push("LINE連携");
  return names;
}

/**
 * 顧客として登録する際の備考。
 * 認証情報そのものは書かず、代表者・希望連携だけを引き継ぐ
 * (ID・パスワードは暗号化された申込レコードにのみ保持する)。
 */
export function applicationNotes(
  app: Application,
  opts?: { viaContractLink?: boolean },
): string {
  const lines = [
    `${opts?.viaContractLink ? "申込・契約URL" : "申込フォーム"}より登録（${app.linkName || "申込URL"}）`,
  ];
  const rep = [app.representativeTitle, app.representativeName].filter(Boolean).join(" ");
  if (rep) lines.push(`代表者: ${rep}`);
  const services = requestedServices(app);
  lines.push(`希望連携: ${services.length ? services.join(" / ") : "なし"}`);
  return lines.join("\n");
}
