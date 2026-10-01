"use client";

import { ArrowLeft, CheckCircle2, FileSignature, MessageCircle } from "lucide-react";
import * as React from "react";
import { submitInquiryAction } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { referralContactMethodLabels, referralTimeSlotLabels } from "@/lib/domain/constants";
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
 * 代理店URLの「まずは相談したい」フォーム。
 * 送信すると「紹介・問い合わせ」に代理店経由として届き、担当者が希望の日時・方法で連絡する。
 * 相談のあとは、同じURLから「このまま申し込む」に進めば代理店の紐付けは引き継がれる。
 */
export function InquiryForm({
  token,
  orgName,
  agencyName,
  onBack,
  onApply,
}: {
  token: string;
  orgName: string;
  agencyName: string | null;
  onBack: () => void;
  onApply: () => void;
}) {
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

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await submitInquiryAction(token, {
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
      <div className="space-y-4">
        <div className="rounded-lg border border-success/40 bg-card p-6 text-center shadow-sm sm:p-8">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <h1 className="mt-3 text-lg font-bold">ご相談を受け付けました</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ありがとうございます。ご希望の日時・方法にあわせて、{orgName}よりご連絡いたします。
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
          <p className="text-muted-foreground">
            内容にご納得いただけましたら、このページ（同じURL）からそのままお申込み・ご契約に進めます。
          </p>
          <Button variant="outline" className="mt-3" onClick={onApply}>
            <FileSignature className="h-4 w-4" />
            お申込み・ご契約に進む
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <MessageCircle className="h-5 w-5 text-primary" />
          まずは相談したい
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ご連絡先とご希望の日時をお知らせください。{orgName}の担当者からご連絡します
          {agencyName ? `（${agencyName} からのご紹介として承ります）` : ""}。
        </p>

        <div className="mt-5 space-y-4">
          <Field label="店舗名・法人名（任意）">
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="例）ヘアサロン〇〇"
              autoComplete="organization"
            />
          </Field>
          <Field label="お名前">
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="例）鈴木 太郎"
              required
              autoComplete="name"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={contactMethod === "email" ? "お電話番号（任意）" : "お電話番号"}>
              <Input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09012345678"
                required={contactMethod !== "email"}
                autoComplete="tel"
              />
            </Field>
            <Field label={contactMethod === "email" ? "メールアドレス" : "メールアドレス（任意）"}>
              <Input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@salon.jp"
                required={contactMethod === "email"}
                autoComplete="email"
              />
            </Field>
          </div>

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
        </div>
      </section>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={pending}>
          <ArrowLeft className="h-4 w-4" />
          戻る
        </Button>
        <Button type="submit" size="lg" className="flex-1" disabled={pending}>
          {pending ? "送信中…" : "この内容で相談する"}
        </Button>
      </div>
      <p className="pb-4 text-center text-xs text-muted-foreground">
        ご入力いただいた内容は、ご連絡とお手続きのためだけに使用します。
      </p>
    </form>
  );
}
