import {
  REFERRAL_FREE_MONTHS,
  REFERRAL_REWARD_RATE,
  referralContactMethodLabels,
  referralTimeSlotLabels,
} from "./constants";
import type { Referral, ReferralContactMethod, ReferralTimeSlot } from "./types";
import { formatJPY, formatDate, toISODate } from "@/lib/utils";

/**
 * 紹介制度の計算・判定(純粋関数)。
 *
 * 特典の設計:
 * - 紹介した側:  紹介された方の初期費用の25%をお支払い
 * - 紹介された側: 初月の端数日数(日割り)＋2ヶ月ぶん無料
 */

/* ---- フォームのURL ---- */

/**
 * 常設の紹介フォームURL。誰でも開けて、誰に紹介されたかはフォームで入力してもらう。
 * これがお客様へ配る基本のURLになる。
 */
export function referralFormUrl(base: string): string {
  return `${base.replace(/\/+$/, "")}/refer`;
}

/**
 * 紹介者を指定した紹介フォームURL。開くと「誰に紹介されたか」が埋まった状態になる。
 * 紹介者ごとに配ると、入力ミスなく紹介元をたどれる。
 */
export function referralLinkUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/refer/${token}`;
}

/* ---- 紹介した側へのお支払い ---- */

/**
 * 紹介報酬を求める。初期費用(税抜)の25%、円未満は四捨五入。
 * 初期費用が0(または未確定)なら0を返す。
 */
export function referralReward(initialFee: number): number {
  if (!initialFee || initialFee <= 0) return 0;
  return Math.round(initialFee * REFERRAL_REWARD_RATE);
}

/** 「初期費用 200,000円 の25% = 50,000円」のような説明文 */
export function referralRewardLabel(initialFee: number): string {
  const reward = referralReward(initialFee);
  if (reward <= 0) return "初期費用の確定後にお支払い額が決まります";
  return `初期費用 ${formatJPY(initialFee)} の${Math.round(REFERRAL_REWARD_RATE * 100)}% = ${formatJPY(reward)}`;
}

/* ---- 紹介された側の特典 ---- */

/** 紹介された側の特典の説明(フォーム・管理画面で共通に使う) */
export function referredBenefitLabel(): string {
  return `初月の端数日数（日割り分）＋${REFERRAL_FREE_MONTHS}ヶ月無料`;
}

/**
 * 無料期間の終わり(最初に請求が発生する月の前月末)を求める。
 * 初月の日割りを無料にしたうえで、さらに REFERRAL_FREE_MONTHS ヶ月ぶん無料にする。
 *
 * 例) 8/22 開始 → 8月の日割り(8/22〜8/31)が無料、9月・10月も無料。
 *     最初の請求は11月分。
 */
export function referralFreeUntil(startedOn: string): string {
  const d = new Date(startedOn);
  // 開始月 + 無料月数 の月末が無料期間の最終日
  return toISODate(new Date(d.getFullYear(), d.getMonth() + REFERRAL_FREE_MONTHS + 1, 0));
}

/** 「2026/08/22 〜 2026/10/31 は無料（初月の日割り＋2ヶ月）」のような説明文 */
export function referralFreePeriodLabel(startedOn: string): string {
  return `${formatDate(startedOn)} 〜 ${formatDate(referralFreeUntil(startedOn))} は無料（${referredBenefitLabel()}）`;
}

/**
 * 紹介から顧客を登録するときのメモ。
 * 誰の紹介か・どの特典が付くかを顧客side にも残しておく。
 */
export function referralNotes(
  referral: Pick<Referral, "referrerName" | "contactMethod" | "preferredDate" | "preferredTimeSlot" | "note">,
): string {
  const lines = [`紹介制度より登録（紹介者: ${referral.referrerName || "未記入"}）`];
  lines.push(`特典: ${referredBenefitLabel()}`);
  lines.push(`連絡希望: ${contactWishLabel(referral)}`);
  if (referral.note) lines.push(`ご相談内容: ${referral.note}`);
  return lines.join("\n");
}

/* ---- 連絡希望 ---- */

/** 時間帯ごとの、電話をかける目安の開始時刻(緊急度の並べ替えに使う) */
const SLOT_HOUR: Record<ReferralTimeSlot, number> = {
  anytime: 9,
  morning: 9,
  early_afternoon: 12,
  late_afternoon: 15,
  evening: 18,
};

/** 「電話 / 9月3日 午前中（9〜12時）」のような1行表記 */
export function contactWishLabel(
  referral: Pick<Referral, "contactMethod" | "preferredDate" | "preferredTimeSlot">,
): string {
  const method = referralContactMethodLabels[referral.contactMethod];
  const slot = referralTimeSlotLabels[referral.preferredTimeSlot];
  if (!referral.preferredDate) return `${method} / 日付の指定なし・${slot}`;
  return `${method} / ${formatDate(referral.preferredDate)} ${slot}`;
}

/** まだ連絡していない状態か(受付・連絡済のうち、顧客登録前) */
export function isOpenReferral(referral: Pick<Referral, "status">): boolean {
  return referral.status === "submitted" || referral.status === "contacted";
}

/** 連絡希望日の状況 */
export interface ContactDue {
  /** 連絡希望日を過ぎているのに、まだ連絡できていない */
  overdue: boolean;
  /** 連絡希望日が今日 */
  today: boolean;
  /** 希望日までの残り日数(希望日が無ければ null) */
  daysUntil: number | null;
}

/**
 * 連絡希望日に対する状況を求める。
 * 「いつ連絡してほしいか」を過ぎていないかが、この機能でいちばん急ぐところ。
 */
export function contactDue(
  referral: Pick<Referral, "status" | "preferredDate">,
  now = new Date(),
): ContactDue {
  const today = toISODate(now);
  if (!referral.preferredDate || !isOpenReferral(referral)) {
    return { overdue: false, today: false, daysUntil: null };
  }
  const target = new Date(referral.preferredDate);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round(
    (new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() -
      base.getTime()) /
      86_400_000,
  );
  return {
    overdue: referral.preferredDate < today,
    today: referral.preferredDate === today,
    daysUntil: diff,
  };
}

/**
 * 連絡すべき順に並べる。
 * 1) 未対応 → 連絡済
 * 2) 連絡希望日が早い順(希望なしは最後)
 * 3) 同じ日なら希望の時間帯が早い順
 */
export function sortByContactWish<
  T extends Pick<Referral, "status" | "preferredDate" | "preferredTimeSlot" | "submittedAt">,
>(referrals: T[]): T[] {
  const statusWeight = (s: Referral["status"]) =>
    s === "submitted" ? 0 : s === "contacted" ? 1 : s === "customer_created" ? 2 : 3;
  return [...referrals].sort((a, b) => {
    const w = statusWeight(a.status) - statusWeight(b.status);
    if (w !== 0) return w;
    if (!!a.preferredDate !== !!b.preferredDate) return a.preferredDate ? -1 : 1;
    if (a.preferredDate && b.preferredDate && a.preferredDate !== b.preferredDate) {
      return a.preferredDate < b.preferredDate ? -1 : 1;
    }
    const slot = SLOT_HOUR[a.preferredTimeSlot] - SLOT_HOUR[b.preferredTimeSlot];
    if (slot !== 0) return slot;
    // 同条件なら古い申込ほど先に対応する
    return a.submittedAt < b.submittedAt ? -1 : 1;
  });
}

/** 連絡先として実際に使う値(選ばれた方法に対応するもの) */
export function contactValue(
  referral: Pick<Referral, "contactMethod" | "phone" | "email">,
): string {
  const byMethod: Record<ReferralContactMethod, string> = {
    phone: referral.phone,
    sms: referral.phone,
    email: referral.email,
    // LINE は連絡先の交換が前提になるため、分かる範囲の連絡先を出す
    line: referral.phone || referral.email,
  };
  return byMethod[referral.contactMethod] || referral.phone || referral.email;
}
