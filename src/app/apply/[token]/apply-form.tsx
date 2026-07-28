"use client";

import { CheckCircle2, Lock } from "lucide-react";
import * as React from "react";
import { submitApplicationAction } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/** 任意入力の連携サービス(ID・パスワード) */
const SERVICES = [
  { key: "hotpepper", label: "ホットペッパービューティ連携情報" },
  { key: "minimo", label: "minimo連携情報" },
  { key: "epark", label: "EPARK連携情報" },
] as const;

type ServiceKey = (typeof SERVICES)[number]["key"];

/**
 * お客様が入力する申込フォーム。
 * 入力された ID・パスワードはサーバー側で暗号化して保存され、
 * 管理画面ではマスク表示(必要なときだけ表示)される。
 */
export function ApplyForm({ token, orgName }: { token: string; orgName: string }) {
  const [companyName, setCompanyName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [representativeTitle, setRepresentativeTitle] = React.useState("");
  const [representativeName, setRepresentativeName] = React.useState("");
  const [creds, setCreds] = React.useState<Record<ServiceKey, { id: string; password: string }>>({
    hotpepper: { id: "", password: "" },
    minimo: { id: "", password: "" },
    epark: { id: "", password: "" },
  });
  const [lineRequested, setLineRequested] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [pending, start] = React.useTransition();

  const setCred = (key: ServiceKey, patch: Partial<{ id: string; password: string }>) =>
    setCreds((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await submitApplicationAction(token, {
        companyName,
        address,
        representativeTitle,
        representativeName,
        hotpepperId: creds.hotpepper.id,
        hotpepperPassword: creds.hotpepper.password,
        minimoId: creds.minimo.id,
        minimoPassword: creds.minimo.password,
        eparkId: creds.epark.id,
        eparkPassword: creds.epark.password,
        lineRequested,
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
      <div className="rounded-lg border border-success/40 bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <h1 className="mt-3 text-lg font-bold">お申込みを受け付けました</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ご入力ありがとうございました。内容を確認のうえ、{orgName}よりご連絡いたします。
          <br />
          このページは閉じていただいて構いません。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-bold">お申込み内容のご入力</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          以下をご入力のうえ、最後に「この内容で申し込む」を押してください。
          <span className="text-destructive">*</span> は必須項目です。
        </p>

        <div className="mt-5 space-y-4">
          <Field label="法人名（個人の場合、個人名） *">
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="株式会社サロンワン"
              required
              autoComplete="organization"
            />
          </Field>
          <Field label="住所（法人の場合、登記住所） *">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="東京都大田区蒲田5-7-4"
              required
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
                required
                autoComplete="name"
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-bold">外部サービス連携情報（任意）</h2>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            連携をご希望のサービスのみご入力ください。
            お預かりしたID・パスワードは暗号化して保管し、連携作業の担当者以外は内容を確認できません。
          </span>
        </p>

        <div className="mt-5 space-y-5">
          {SERVICES.map((s) => (
            <div key={s.key} className="rounded-md border border-border/70 p-4">
              <p className="text-sm font-semibold">{s.label}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="ID">
                  <Input
                    value={creds[s.key].id}
                    onChange={(e) => setCred(s.key, { id: e.target.value })}
                    autoComplete="off"
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
      </section>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-base font-bold">LINE連携申込</h2>
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-md border border-border/70 p-4 hover:bg-muted/50">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            checked={lineRequested}
            onChange={(e) => setLineRequested(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">LINE連携を申し込む</span>
            <span className="mt-0.5 block text-muted-foreground">
              チェックを入れると、LINE連携ありでお申込みを受け付けます。
            </span>
          </span>
        </label>
      </section>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "送信中…" : "この内容で申し込む"}
      </Button>
    </form>
  );
}
