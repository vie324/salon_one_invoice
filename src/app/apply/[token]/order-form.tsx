"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSignature,
  Gift,
  Handshake,
  Landmark,
  Lock,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import * as React from "react";
import { submitOrderAction } from "@/app/actions/applications";
import { ContractDocument } from "@/components/contracts/contract-document";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { REFERRAL_FREE_MONTHS } from "@/lib/domain/constants";
import { computeOrderQuote, validOptionKeys } from "@/lib/domain/pricing";
import type { Organization, Plan } from "@/lib/domain/types";
import {
  buildOrderContract,
  previewOrderContract,
  type OrderTemplate,
} from "@/lib/orders/contract-draft";
import { cn, formatJPY } from "@/lib/utils";
import { InquiryForm } from "./inquiry-form";

/** フォーム上部の案内(誰からのご紹介か・特典) */
export interface OrderFormIntro {
  agencyName: string | null;
  memberName: string | null;
  referralBenefit: boolean;
  referrerName: string | null;
}

/** short は「次へ（…）」ボタン用(スマホ幅でもボタンが画面からはみ出さない長さ) */
const STEPS = [
  { key: "info", label: "お客様情報", short: "お客様情報" },
  { key: "plan", label: "プラン・料金", short: "プラン・料金" },
  { key: "services", label: "連携情報", short: "連携情報" },
  { key: "contract", label: "契約の確認・署名", short: "契約・署名" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/** 任意入力の連携サービス(ID・パスワード) */
const SERVICES = [
  { key: "hotpepper", label: "ホットペッパービューティ" },
  { key: "minimo", label: "minimo" },
  { key: "epark", label: "EPARK" },
] as const;

type ServiceKey = (typeof SERVICES)[number]["key"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 申込＋契約を1本で完結させるフォーム(お客様向け)。
 *
 *   ① お客様情報 → ② プラン・料金 → ③ 連携情報(任意) → ④ 契約内容の確認・電子署名 → 完了
 *
 * ④ で表示する契約書は、送信後にサーバーで作る契約書と同じ関数で組み立てている
 * (確認した内容 = 締結される内容)。料金もプラン・個別価格から同じ計算で出す。
 */
export function OrderForm({
  token,
  orgName,
  plan,
  link,
  template,
  org,
  intro,
  allowInquiry,
  emailEnabled,
  prefill,
}: {
  token: string;
  orgName: string;
  plan: Plan;
  link: {
    optionKeys: string[];
    storeCount: number | null;
    initialFeeOverride: number | null;
    monthlyPriceOverride: number | null;
  };
  template: OrderTemplate;
  org: Pick<Organization, "name" | "postalCode" | "address" | "email">;
  intro: OrderFormIntro;
  allowInquiry: boolean;
  emailEnabled: boolean;
  prefill: { companyName: string; contactName: string; phone: string; email: string } | null;
}) {
  const [mode, setMode] = React.useState<"choose" | "inquiry" | "order">(
    allowInquiry ? "choose" : "order",
  );
  const [step, setStep] = React.useState(0);
  const topRef = React.useRef<HTMLDivElement>(null);

  // ① お客様情報
  const [companyName, setCompanyName] = React.useState(prefill?.companyName ?? "");
  const [address, setAddress] = React.useState("");
  const [representativeTitle, setRepresentativeTitle] = React.useState("");
  const [representativeName, setRepresentativeName] = React.useState("");
  const [contactName, setContactName] = React.useState(prefill?.contactName ?? "");
  const [phone, setPhone] = React.useState(prefill?.phone ?? "");
  const [email, setEmail] = React.useState(prefill?.email ?? "");

  // ② プラン・料金
  const [optionKeys, setOptionKeys] = React.useState<string[]>(
    validOptionKeys(plan, link.optionKeys),
  );
  const storeFixed = link.storeCount != null;
  const [storeCount, setStoreCount] = React.useState<number>(link.storeCount ?? 1);

  // ③ 連携情報
  const [creds, setCreds] = React.useState<Record<ServiceKey, { id: string; password: string }>>({
    hotpepper: { id: "", password: "" },
    minimo: { id: "", password: "" },
    epark: { id: "", password: "" },
  });
  const hasLineOption = plan.options.some((o) => o.key === "line");
  const [lineChecked, setLineChecked] = React.useState(false);
  const lineRequested = hasLineOption ? optionKeys.includes("line") : lineChecked;

  // ④ 署名
  const [signerName, setSignerName] = React.useState("");
  const [agreed, setAgreed] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ signUrl: string } | null>(null);
  const [pending, start] = React.useTransition();

  const selection = {
    plan,
    optionKeys,
    storeCount,
    initialFeeOverride: link.initialFeeOverride,
    monthlyPriceOverride: link.monthlyPriceOverride,
  };
  const quote = computeOrderQuote(selection);
  const info = { companyName, address, representativeTitle, representativeName, email };
  const stepKey: StepKey = STEPS[step].key;

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const setCred = (key: ServiceKey, patch: Partial<{ id: string; password: string }>) =>
    setCreds((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const toggleOption = (key: string) =>
    setOptionKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  /** 今のステップの入力チェック(問題があればメッセージを返す) */
  const validate = (key: StepKey): string | null => {
    if (key === "info") {
      if (!companyName.trim()) return "法人名（個人の場合は個人名）を入力してください";
      if (!address.trim()) return "住所を入力してください";
      if (!representativeName.trim()) return "代表者名を入力してください";
      if (!phone.trim()) return "電話番号を入力してください";
      if (!email.trim()) return "メールアドレスを入力してください";
      if (!EMAIL_RE.test(email.trim())) return "メールアドレスの形式が正しくありません";
    }
    if (key === "plan") {
      if (!Number.isInteger(storeCount) || storeCount < 1) return "店舗数を入力してください";
      if (storeCount > 99) return "店舗数が多い場合は担当者へご相談ください（99店舗まで）";
    }
    if (key === "contract") {
      if (!signerName.trim()) return "署名者のお名前を入力してください";
      if (!agreed) return "契約内容をご確認のうえ、同意にチェックを入れてください";
    }
    return null;
  };

  const next = () => {
    const message = validate(stepKey);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    // 署名欄は代表者名を初期値にする(担当者が代わりに署名する場合は書き換えてもらう)
    if (STEPS[step + 1]?.key === "contract" && !signerName.trim()) {
      setSignerName(representativeName.trim());
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    scrollTop();
  };

  const back = () => {
    setError(null);
    if (step === 0) {
      if (allowInquiry) setMode("choose");
      return;
    }
    setStep((s) => Math.max(0, s - 1));
    scrollTop();
  };

  const submit = () => {
    for (const s of STEPS) {
      const message = validate(s.key);
      if (message) {
        setError(message);
        return;
      }
    }
    setError(null);
    start(async () => {
      const res = await submitOrderAction(token, {
        companyName,
        address,
        representativeTitle,
        representativeName,
        contactName,
        phone,
        email,
        hotpepperId: creds.hotpepper.id,
        hotpepperPassword: creds.hotpepper.password,
        minimoId: creds.minimo.id,
        minimoPassword: creds.minimo.password,
        eparkId: creds.epark.id,
        eparkPassword: creds.epark.password,
        lineRequested,
        optionKeys,
        storeCount: storeFixed ? undefined : storeCount,
        signerName,
        agreed,
        templateId: template.id,
        templateVersion: template.version,
      });
      if (res.ok) {
        setDone({ signUrl: res.signUrl });
        scrollTop();
      } else {
        setError(res.error ?? "送信に失敗しました。時間をおいて再度お試しください。");
      }
    });
  };

  /* ---------------- 完了 ---------------- */
  if (done) {
    return (
      <div ref={topRef} className="space-y-4">
        <div className="rounded-lg border border-success/40 bg-card p-6 text-center shadow-sm sm:p-8">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <h1 className="mt-3 text-lg font-bold">お申込み・ご契約を受け付けました</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ありがとうございます。{orgName}でお申込み内容を確認し、ご契約を確定します。
            {emailEnabled && (
              <>
                <br />
                ご入力のメールアドレスに受付完了のメールをお送りしました。
              </>
            )}
          </p>
          <a
            href={done.signUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <FileSignature className="h-4 w-4" />
            ご署名いただいた契約書を表示・保存する
          </a>
          <p className="mt-2 text-xs text-muted-foreground">
            締結証明書つきで印刷・PDF保存できます。このページは閉じていただいて構いません。
          </p>
        </div>
        <NextSteps orgName={orgName} />
      </div>
    );
  }

  /* ---------------- 入口(相談 / 申込) ---------------- */
  if (mode === "choose") {
    return (
      <div ref={topRef} className="space-y-4">
        <IntroBanner intro={intro} orgName={orgName} />
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("inquiry")}
            className="rounded-lg border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <MessageCircle className="h-6 w-6 text-primary" />
            <div className="mt-2 text-base font-bold">まずは相談したい</div>
            <p className="mt-1 text-sm text-muted-foreground">
              ご希望の日時・方法で、{orgName}の担当者からご連絡します。内容をお聞きしてからお申込みいただけます。
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode("order")}
            className="rounded-lg border border-primary/40 bg-card p-5 text-left shadow-sm transition-colors hover:border-primary hover:bg-primary/5"
          >
            <FileSignature className="h-6 w-6 text-primary" />
            <div className="mt-2 text-base font-bold">このまま申し込む（ご契約まで）</div>
            <p className="mt-1 text-sm text-muted-foreground">
              お客様情報の入力 → 料金の確認 → 契約内容の確認と電子署名まで、この画面で完了します（約5分）。
            </p>
          </button>
        </div>
      </div>
    );
  }

  if (mode === "inquiry") {
    return (
      <div ref={topRef}>
        <InquiryForm
          token={token}
          orgName={orgName}
          agencyName={intro.agencyName}
          onBack={() => setMode("choose")}
          onApply={() => setMode("order")}
        />
      </div>
    );
  }

  /* ---------------- 申込 + 契約 ---------------- */
  const draft = buildOrderContract({ template, org, info, selection });
  const preview = previewOrderContract(draft);

  return (
    <div ref={topRef} className="scroll-mt-4 space-y-5">
      <IntroBanner intro={intro} orgName={orgName} />
      <Stepper current={step} />

      {stepKey === "info" && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
          <SectionTitle
            title="① お客様情報"
            description="契約書の「乙（ご契約者）」欄と、ご連絡・請求書の送付先になります。* は必須です。"
          />
          <Field label="法人名（個人の場合、個人名） *">
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="株式会社サロンワン"
              autoComplete="organization"
            />
          </Field>
          <Field label="住所（法人の場合、登記住所） *" hint="口座振替依頼書もこちらへ郵送します。">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="東京都大田区蒲田5-7-4"
              autoComplete="street-address"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="代表者役職">
              <Input
                value={representativeTitle}
                onChange={(e) => setRepresentativeTitle(e.target.value)}
                placeholder="代表取締役"
              />
            </Field>
            <Field label="代表者名 *">
              <Input
                value={representativeName}
                onChange={(e) => setRepresentativeName(e.target.value)}
                placeholder="山田 太郎"
                autoComplete="name"
              />
            </Field>
          </div>
          <Field
            label="ご担当者名"
            hint="日々のやり取りをさせていただく方。未入力の場合は代表者様へご連絡します。"
          >
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="山田 花子"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="電話番号 *">
              <Input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03-1234-5678"
                autoComplete="tel"
              />
            </Field>
            <Field label="メールアドレス *" hint="ご連絡・請求書の送付先になります。">
              <Input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@example.com"
                autoComplete="email"
              />
            </Field>
          </div>
        </section>
      )}

      {stepKey === "plan" && (
        <section className="space-y-5 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
          <SectionTitle
            title="② プラン・料金のご確認"
            description="ご利用になるオプションと店舗数を選んでください。金額は税抜表示（カッコ内は税込）です。"
          />
          <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3">
            <div className="text-xs text-muted-foreground">お申込みプラン</div>
            <div className="mt-0.5 text-base font-bold">{quote.planName}</div>
            {plan.description && (
              <div className="text-xs text-muted-foreground">{plan.description}</div>
            )}
          </div>

          {plan.options.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-medium">オプション（1店舗あたり・月額）</div>
              <div className="space-y-2">
                {plan.options.map((o) => (
                  <label
                    key={o.key}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-md border p-3 text-sm transition-colors",
                      optionKeys.includes(o.key)
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[hsl(var(--primary))]"
                        checked={optionKeys.includes(o.key)}
                        onChange={() => toggleOption(o.key)}
                      />
                      <span className="font-medium">{o.name}</span>
                    </span>
                    <span className="tabular whitespace-nowrap text-muted-foreground">
                      +{formatJPY(o.monthly)}/月
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <Field
            label="ご契約店舗数"
            hint={
              storeFixed
                ? "担当者とお打ち合わせ済みの店舗数です。変更がある場合は担当者へご連絡ください。"
                : "月額料金は1店舗あたりの金額です。屋号・所在地ごとに1店舗と数えます。"
            }
          >
            {storeFixed ? (
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2.5 text-sm font-medium">
                {storeCount}店舗
              </div>
            ) : (
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={storeCount}
                onChange={(e) => setStoreCount(Math.round(Number(e.target.value)) || 0)}
                className="w-32"
              />
            )}
          </Field>

          <PriceSummary quote={quote} />
          <PaymentFlow referralBenefit={intro.referralBenefit} />
        </section>
      )}

      {stepKey === "services" && (
        <section className="space-y-5 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
          <SectionTitle
            title="③ 外部サービスの連携情報（任意）"
            description="システムの初期設定で連携に使います。分かる範囲でご入力ください。後からでも構いません。"
          />
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            お預かりしたID・パスワードは暗号化して保管し、連携作業の担当者以外は内容を確認できません。
          </p>
          <div className="space-y-4">
            {SERVICES.map((s) => (
              <div key={s.key} className="rounded-md border border-border/70 p-4">
                <p className="text-sm font-semibold">{s.label}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="ID">
                    <Input
                      value={creds[s.key].id}
                      onChange={(e) => setCred(s.key, { id: e.target.value })}
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="PASS">
                    <Input
                      type="password"
                      value={creds[s.key].password}
                      onChange={(e) => setCred(s.key, { password: e.target.value })}
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          {hasLineOption ? (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              LINE連携：{lineRequested ? "お申込みあり（② で選択済み）" : "お申込みなし"}
            </p>
          ) : (
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border/70 p-4 hover:bg-muted/50">
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 accent-[hsl(var(--primary))]"
                checked={lineChecked}
                onChange={(e) => setLineChecked(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">LINE連携を希望する</span>
                <span className="mt-0.5 block text-muted-foreground">
                  チェックを入れると、LINE連携ありで初期設定を進めます。
                </span>
              </span>
            </label>
          )}
        </section>
      )}

      {stepKey === "contract" && (
        <>
          <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
            <SectionTitle
              title="④ 契約内容のご確認"
              description="ご入力内容と料金が反映された契約書です。最後までご確認ください。"
            />
            <dl className="grid gap-x-6 gap-y-2 rounded-md bg-muted/50 p-3 text-sm sm:grid-cols-2">
              <Summary label="ご契約者" value={companyName} />
              <Summary
                label="代表者"
                value={[representativeTitle, representativeName].filter(Boolean).join(" ")}
              />
              <Summary label="プラン" value={`${quote.planName}・${quote.storeCount}店舗`} />
              <Summary
                label="オプション"
                value={quote.options.length ? quote.options.map((o) => o.name).join(" / ") : "なし"}
              />
              <Summary
                label="初期費用"
                value={`${formatJPY(quote.initialFee)}（税込 ${formatJPY(quote.initialFeeWithTax)}）`}
              />
              <Summary
                label="月額"
                value={`${formatJPY(quote.monthlyTotal)}（税込 ${formatJPY(quote.monthlyTotalWithTax)}）`}
              />
            </dl>
          </section>

          <ContractDocument contract={preview} />

          <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              電子署名（同意）
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              ご署名いただく方の氏名をご入力のうえ、同意にチェックして「同意して申し込む」を押してください。
              これをもって書面への記名押印に代わる電子署名となります。
            </p>
            <div className="mt-4 space-y-4">
              <Field label="署名者氏名（ご本人の氏名を正確にご入力ください）">
                <Input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="例）山田 太郎"
                  autoComplete="name"
                  disabled={pending}
                />
              </Field>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/40 p-4 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  disabled={pending}
                />
                <span>
                  上記の契約書の内容をすべて確認し、同意のうえ申し込みます。また、本契約が電磁的記録により締結されること、
                  および締結の証跡（同意日時・IPアドレス・端末情報等）が記録されることに同意します。
                </span>
              </label>
              <p className="text-xs text-muted-foreground">
                契約書第3条のとおり、{orgName}がお申込みを確認して承諾した時点でご契約が成立します。
              </p>
            </div>
          </section>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {/* スマホでは入力途中でもすぐ押せるよう、操作ボタンを画面下に固定する */}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-background/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {(step > 0 || allowInquiry) && (
          <Button variant="outline" size="lg" onClick={back} disabled={pending}>
            <ArrowLeft className="h-4 w-4" />
            戻る
          </Button>
        )}
        {stepKey !== "contract" ? (
          <Button size="lg" className="flex-1" onClick={next}>
            次へ（{STEPS[step + 1].short}）
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="lg" className="flex-1" onClick={submit} disabled={pending || !agreed}>
            <CheckCircle2 className="h-4 w-4" />
            {pending ? (
              "送信中…"
            ) : (
              <>
                同意して申し込む
                <span className="hidden sm:inline">（契約を締結）</span>
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 部品 */

function Stepper({ current }: { current: number }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="お申込みの手順">
      {STEPS.map((s, i) => (
        <li
          key={s.key}
          aria-current={i === current ? "step" : undefined}
          className={cn(
            "rounded-md border px-1.5 py-2 text-center text-[11px] leading-tight sm:text-xs",
            i < current && "border-success/40 bg-success/10 text-success",
            i === current && "border-primary bg-primary text-primary-foreground",
            i > current && "border-border bg-card text-muted-foreground",
          )}
        >
          <span className="block font-semibold tabular">{i < current ? "✓" : i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function IntroBanner({ intro, orgName }: { intro: OrderFormIntro; orgName: string }) {
  if (intro.referralBenefit) {
    return (
      <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-start gap-2.5">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm leading-relaxed">
            <div className="font-bold">
              {intro.referrerName ? `${intro.referrerName} 様からのご紹介` : "ご紹介でのお申込み"}
            </div>
            ご紹介特典として、
            <span className="font-bold">
              初月の端数日数（日割り分）と、そのあと{REFERRAL_FREE_MONTHS}ヶ月ぶんの月額料金が無料
            </span>
            になります（ご契約の確定時に自動で適用されます）。
          </div>
        </div>
      </section>
    );
  }
  if (intro.agencyName) {
    return (
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-2.5">
          <Handshake className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm leading-relaxed">
            <div className="font-bold">
              {intro.agencyName}
              {intro.memberName ? `（担当: ${intro.memberName}）` : ""} からのご案内
            </div>
            {orgName} のサービスのお申込みページです。
          </div>
        </div>
      </section>
    );
  }
  return null;
}

function PriceSummary({ quote }: { quote: ReturnType<typeof computeOrderQuote> }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          <tr>
            <td className="px-3 py-2.5 text-muted-foreground">
              初期費用{quote.initialFeeOverridden && <span className="ml-1 text-xs">（個別価格）</span>}
            </td>
            <td className="tabular px-3 py-2.5 text-right font-medium">
              {formatJPY(quote.initialFee)}
              <span className="ml-1 text-xs text-muted-foreground">
                （税込 {formatJPY(quote.initialFeeWithTax)}）
              </span>
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2.5 text-muted-foreground">
              月額 基本料金{quote.monthlyOverridden && <span className="ml-1 text-xs">（個別価格）</span>}
            </td>
            <td className="tabular px-3 py-2.5 text-right">{formatJPY(quote.basePerStore)}/店舗</td>
          </tr>
          {quote.options.map((o) => (
            <tr key={o.key}>
              <td className="px-3 py-2.5 text-muted-foreground">＋ {o.name}</td>
              <td className="tabular px-3 py-2.5 text-right">{formatJPY(o.monthly)}/店舗</td>
            </tr>
          ))}
          <tr className="bg-muted/40">
            <td className="px-3 py-2.5 font-medium">月額合計（{quote.storeCount}店舗）</td>
            <td className="tabular px-3 py-2.5 text-right text-base font-bold">
              {formatJPY(quote.monthlyTotal)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                （税込 {formatJPY(quote.monthlyTotalWithTax)}）
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PaymentFlow({ referralBenefit }: { referralBenefit: boolean }) {
  return (
    <div className="space-y-2 rounded-md bg-muted/50 p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <Landmark className="h-4 w-4 text-primary" />
        お支払いの流れ
      </div>
      <ol className="space-y-1.5 pl-1">
        <li>
          <span className="font-medium">初回：</span>
          初期費用＋初月の日割り料金（ご利用開始日〜月末）。請求書をお送りしますので
          <span className="font-medium">銀行振込</span>でお支払いください。
          {referralBenefit && (
            <span className="text-primary">（ご紹介特典により初月の日割り分は無料）</span>
          )}
        </li>
        <li>
          <span className="font-medium">2ヶ月目以降：</span>
          月額料金を<span className="font-medium">口座振替</span>
          で毎月お引き落としします。口座振替依頼書を郵送しますので、ご記入のうえご返送ください。
          {referralBenefit && (
            <span className="text-primary">
              （ご紹介特典により、さらに{REFERRAL_FREE_MONTHS}ヶ月分は無料）
            </span>
          )}
        </li>
      </ol>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value || "—"}</dd>
    </div>
  );
}

function NextSteps({ orgName }: { orgName: string }) {
  const steps = [
    `${orgName}でお申込み内容を確認し、ご契約を確定します。`,
    "初回のご請求書（初期費用＋初月の日割り料金）をお送りします。銀行振込でお支払いください。",
    "口座振替依頼書を郵送します。ご記入・ご捺印のうえご返送ください（2ヶ月目以降の月額のお支払いに使います）。",
    "システムの初期設定が完了しましたら、ご利用開始のご案内をお送りします。",
  ];
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      <h2 className="text-sm font-bold">このあとの流れ</h2>
      <ol className="mt-3 space-y-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <span className="leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
