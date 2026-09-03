"use client";

import { CheckCircle2, Gift } from "lucide-react";
import * as React from "react";
import { submitReferralAction } from "@/app/actions/referrals";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  REFERRAL_FREE_MONTHS,
  referralContactMethodLabels,
  referralTimeSlotLabels,
} from "@/lib/domain/constants";
import type { ReferralContactMethod, ReferralTimeSlot } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const METHODS: ReferralContactMethod[] = ["phone", "email", "sms", "line"];
const SLOTS: ReferralTimeSlot[] = [
  "anytime",
  "morning",
  "early_afternoon",
  "late_afternoon",
  "evening",
];

/**
 * ご紹介いただいた方に入力していただくフォーム(認証不要)。
 * 誰に紹介されたか・いつ・どの方法で連絡してほしいかを受け取る。
 *
 * 紹介者があらかじめ分かっているURL(/refer/<token>)から開いた場合は、
 * 紹介者名を固定で表示し、入力させない。
 */
export function ReferForm({
  token,
  orgName,
  fixedReferrerName,
}: {
  /** 紹介者を指定したURLのトークン(常設フォームでは null) */
  token: string | null;
  orgName: string;
  /** URLで紹介者が決まっている場合の氏名 */
  fixedReferrerName?: string;
}) {
  const [referrerName, setReferrerName] = React.useState(fixedReferrerName ?? "");
  const [companyName, setCompanyName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [contactMethod, setContactMethod] = React.useState<ReferralContactMethod>("phone");
  const [preferredDate, setPreferredDate] = React.useState("");
  const [preferredTimeSlot, setPreferredTimeSlot] = React.useState<ReferralTimeSlot>("anytime");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [pending, start] = React.useTransition();

  const locked = Boolean(fixedReferrerName);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await submitReferralAction(token, {
        referrerName,
        companyName,
        contactName,
        phone,
        email,
        contactMethod,
        preferredDate: preferredDate || null,
        preferredTimeSlot,
        note,
      });
      if (res.ok) {
        setDone(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError(res.error ?? "送信に失敗しました。時間をおいて再度お試しください。");
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-success/40 bg-card p-6 text-center shadow-sm sm:p-8">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <h1 className="mt-3 text-lg font-bold">お申込みを受け付けました</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ありがとうございます。ご希望の日時・方法にあわせて、{orgName}よりご連絡いたします。
          <br />
          このページは閉じていただいて構いません。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* 特典の案内 — 何が得られるのかを最初に伝える */}
      <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5">
        <div className="flex items-start gap-2.5">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h1 className="text-base font-bold">ご紹介特典のお申込み</h1>
            <p className="mt-1.5 text-sm leading-relaxed">
              ご紹介でお申込みいただいた方は、
              <span className="font-bold">
                初月の端数日数（日割り分）と、そのあと{REFERRAL_FREE_MONTHS}ヶ月ぶんの月額料金が無料
              </span>
              になります。
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              下記をご入力のうえ送信してください。ご希望の日時・方法で{orgName}よりご連絡いたします。
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold">ご紹介者について</h2>
        {locked ? (
          <Field label="ご紹介者" hint="このURLからのお申込みは、こちらの方のご紹介として受け付けます。">
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2.5 text-sm font-medium">
              {fixedReferrerName}
            </div>
          </Field>
        ) : (
          <Field
            label="どなたのご紹介ですか？"
            hint="ご紹介くださった方のお名前・店舗名をご記入ください（特典のご案内に必要です）。"
          >
            <Input
              value={referrerName}
              onChange={(e) => setReferrerName(e.target.value)}
              placeholder="例）サロン〇〇 山田様"
              required
            />
          </Field>
        )}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold">お客様について</h2>
        <Field label="店舗名・法人名（任意）">
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="例）ヘアサロン〇〇"
          />
        </Field>
        <Field label="お名前">
          <Input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="例）鈴木 太郎"
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={contactMethod === "email" ? "お電話番号（任意）" : "お電話番号"}>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09012345678"
              required={contactMethod !== "email"}
            />
          </Field>
          <Field label={contactMethod === "email" ? "メールアドレス" : "メールアドレス（任意）"}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@salon.jp"
              required={contactMethod === "email"}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="text-sm font-bold">ご連絡について</h2>

        <Field label="ご連絡方法のご希望">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setContactMethod(m)}
                aria-pressed={contactMethod === m}
                className={cn(
                  "h-11 rounded-md border text-sm font-medium transition-colors",
                  contactMethod === m
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card hover:bg-muted",
                )}
              >
                {m === "sms" ? "SMS" : referralContactMethodLabels[m]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ご連絡希望日（任意）" hint="空欄の場合は、こちらから早めにご連絡します。">
            <Input
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
            />
          </Field>
          <Field label="ご希望の時間帯">
            <Select
              value={preferredTimeSlot}
              onChange={(e) => setPreferredTimeSlot(e.target.value as ReferralTimeSlot)}
            >
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  {referralTimeSlotLabels[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="ご相談内容・ご要望（任意）">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ご質問やご希望があればご記入ください。"
          />
        </Field>
      </section>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "送信中…" : "この内容で申し込む"}
      </Button>
      <p className="pb-4 text-center text-xs text-muted-foreground">
        ご入力いただいた内容は、ご連絡とお手続きのためだけに使用します。
      </p>
    </form>
  );
}
