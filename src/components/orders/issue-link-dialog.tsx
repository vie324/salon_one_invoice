"use client";

import { Check, Copy, FileSignature, Link2, MessageSquareText, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createApplicationLinkAction } from "@/app/actions/applications";
import { QrCodeImage } from "@/components/share/share-link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { agencyRateLabel } from "@/lib/domain/agency";
import {
  AGENCY_DEAL_TYPE_KEYS,
  AGENCY_DEAL_TYPES,
  AGENCY_LINK_EXPIRY_DAYS,
  APPLICATION_LINK_EXPIRY_DAYS,
} from "@/lib/domain/constants";
import { computeOrderQuote, planDisplayName, validOptionKeys } from "@/lib/domain/pricing";
import type { Agency, AgencyDealType, AgencyMember, Plan } from "@/lib/domain/types";
import { cn, formatJPY } from "@/lib/utils";

const EXPIRY_OPTIONS = [
  { value: 7, label: "7日間" },
  { value: 14, label: "14日間" },
  { value: 30, label: "30日間" },
  { value: 90, label: "90日間" },
  { value: 0, label: "無期限" },
];

/**
 * 申込・契約URLの発行ダイアログ。受注管理・代理店・紹介の各画面から使う。
 *
 * - mode="customer": お客様ごとのURL(標準)。申込＋契約 / 申込のみ を選べる
 * - mode="agency":   代理店に渡す常設URL。代理店は固定、「まずは相談したい」の入口つき
 * - mode="referral": 紹介・問い合わせから発行するURL。紹介者・代理店の紐付けを引き継ぐ
 */
export function IssueLinkDialog({
  plans,
  agencies,
  members,
  orgName,
  mode = "customer",
  defaults,
  triggerLabel,
  triggerSize = "md",
  triggerVariant = "primary",
}: {
  plans: Plan[];
  agencies: Agency[];
  members: AgencyMember[];
  orgName: string;
  mode?: "customer" | "agency" | "referral";
  defaults?: {
    name?: string;
    planId?: string | null;
    agencyId?: string | null;
    agencyMemberId?: string | null;
    referralId?: string | null;
  };
  triggerLabel?: string;
  triggerSize?: "sm" | "md";
  triggerVariant?: "primary" | "outline";
}) {
  const router = useRouter();
  const activePlans = plans.filter((p) => p.active);
  const lockedAgency = mode === "agency";
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<{ url: string; name: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const initialAgency = agencies.find((a) => a.id === defaults?.agencyId) ?? null;
  const [form, setForm] = React.useState(() => ({
    name: defaults?.name ?? "",
    withContract: true,
    planId: defaults?.planId ?? activePlans[0]?.id ?? "",
    optionKeys: [] as string[],
    storeMode: (mode === "agency" ? "customer" : "fixed") as "customer" | "fixed",
    storeCount: 1,
    useCustomPrice: false,
    initialFeeOverride: "",
    monthlyPriceOverride: "",
    agencyId: initialAgency?.id ?? "",
    agencyMemberId: defaults?.agencyMemberId ?? "",
    agencyDealType: (initialAgency?.defaultDealType ?? "referral") as AgencyDealType,
    allowInquiry: mode === "agency",
    expiryDays: mode === "agency" ? AGENCY_LINK_EXPIRY_DAYS : APPLICATION_LINK_EXPIRY_DAYS,
  }));
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const plan = activePlans.find((p) => p.id === form.planId) ?? null;
  const agency = agencies.find((a) => a.id === form.agencyId) ?? null;
  const agencyMembers = members.filter((m) => m.agencyId === form.agencyId && m.active);
  const quote = plan
    ? computeOrderQuote({
        plan,
        optionKeys: form.optionKeys,
        storeCount: form.storeMode === "fixed" ? form.storeCount : 1,
        initialFeeOverride: form.useCustomPrice ? toNumber(form.initialFeeOverride) : null,
        monthlyPriceOverride: form.useCustomPrice ? toNumber(form.monthlyPriceOverride) : null,
      })
    : null;

  const reset = () => {
    setResult(null);
    setError(null);
  };

  const onPlanChange = (planId: string) => {
    const p = activePlans.find((x) => x.id === planId);
    set({ planId, optionKeys: p ? validOptionKeys(p, form.optionKeys) : [] });
  };

  const onAgencyChange = (agencyId: string) => {
    const a = agencies.find((x) => x.id === agencyId);
    set({
      agencyId,
      agencyMemberId: "",
      agencyDealType: a?.defaultDealType ?? "referral",
    });
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createApplicationLinkAction({
        name: form.name.trim(),
        expiryDays: form.expiryDays,
        withContract: form.withContract,
        planId: form.withContract ? form.planId || null : null,
        optionKeys: form.withContract ? form.optionKeys : [],
        storeCount: form.withContract && form.storeMode === "fixed" ? form.storeCount : null,
        initialFeeOverride:
          form.withContract && form.useCustomPrice ? toNumber(form.initialFeeOverride) : null,
        monthlyPriceOverride:
          form.withContract && form.useCustomPrice ? toNumber(form.monthlyPriceOverride) : null,
        agencyId: form.agencyId || null,
        agencyMemberId: form.agencyId ? form.agencyMemberId || null : null,
        agencyDealType: form.agencyId ? form.agencyDealType : null,
        referralId: defaults?.referralId ?? null,
        allowInquiry: form.withContract && form.allowInquiry,
      });
      if (!res.ok) {
        setError(res.error ?? "発行に失敗しました");
        return;
      }
      setResult({ url: res.url, name: form.name.trim() });
      router.refresh();
    });

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("コピーしてお使いください", text);
    }
  }

  const guide = result
    ? guideMessage({
        mode,
        url: result.url,
        name: result.name,
        orgName,
        agency,
        dealType: form.agencyDealType,
        withContract: form.withContract,
        allowInquiry: form.allowInquiry,
      })
    : "";

  const title =
    mode === "agency"
      ? "代理店用の申込・契約URLを発行"
      : mode === "referral"
        ? "紹介から申込・契約URLを発行"
        : "申込・契約URLを発行";

  return (
    <>
      <Button
        size={triggerSize}
        variant={triggerVariant}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {triggerSize === "sm" ? <Link2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {triggerLabel ?? title}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={result ? "URLを発行しました" : title}
        description={
          result
            ? "URLをコピー・QRコード・案内文のいずれかでお渡しください。"
            : mode === "agency"
              ? "代理店がお客様に渡すURLです。相談の受付とお申込み・ご契約の両方に使えます。"
              : "お客様がこのURLから申込内容を入力し、契約内容を確認して電子署名するまで1本で完了します。"
        }
        className="max-w-xl"
      >
        {result ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <QrCodeImage value={result.url} className="h-48 w-48" />
              <code className="w-full break-all rounded-md bg-muted px-3 py-2 text-center text-xs">
                {result.url}
              </code>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => copy("url", result.url)}>
                {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied === "url" ? "コピーしました" : "URLをコピー"}
              </Button>
              <Button variant="outline" onClick={() => copy("guide", guide)}>
                {copied === "guide" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <MessageSquareText className="h-4 w-4" />
                )}
                {copied === "guide" ? "コピーしました" : "案内文ごとコピー"}
              </Button>
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">
              {guide}
            </pre>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>閉じる</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {mode === "customer" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <ModeOption
                  active={form.withContract}
                  onClick={() => set({ withContract: true })}
                  title="申込＋契約（おすすめ）"
                  body="入力 → 料金確認 → 電子署名まで1本で完了"
                />
                <ModeOption
                  active={!form.withContract}
                  onClick={() => set({ withContract: false })}
                  title="申込のみ"
                  body="料金が未確定のとき。契約書は後から送付"
                />
              </div>
            )}

            <Field
              label="名前（宛先メモ）"
              hint={
                mode === "agency"
                  ? "例: ○○代理店（山田さん用）。一覧でどのURLか見分けるための名前です。"
                  : "例: ○○サロン様。お客様には表示されません。"
              }
            >
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={mode === "agency" ? "○○代理店 山田さん用" : "○○サロン様"}
                autoFocus
              />
            </Field>

            {form.withContract && (
              <>
                <Field label="プラン" hint="お客様には「プラン名・料金」が表示され、契約書の料金表に反映されます。">
                  <Select value={form.planId} onChange={(e) => onPlanChange(e.target.value)}>
                    {activePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {planDisplayName(p)} 初期 {formatJPY(p.initialFee)} / 月 {formatJPY(p.amount)}
                      </option>
                    ))}
                  </Select>
                </Field>

                {plan && plan.options.length > 0 && (
                  <Field label="オプションの初期選択" hint="お客様がフォームで付け外しできます。">
                    <div className="flex flex-wrap gap-2">
                      {plan.options.map((o) => (
                        <label
                          key={o.key}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[hsl(var(--primary))]"
                            checked={form.optionKeys.includes(o.key)}
                            onChange={() =>
                              set({
                                optionKeys: form.optionKeys.includes(o.key)
                                  ? form.optionKeys.filter((k) => k !== o.key)
                                  : [...form.optionKeys, o.key],
                              })
                            }
                          />
                          {o.name}（{formatJPY(o.monthly)}/月）
                        </label>
                      ))}
                    </div>
                  </Field>
                )}

                <Field label="店舗数">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                        checked={form.storeMode === "customer"}
                        onChange={() => set({ storeMode: "customer" })}
                      />
                      お客様が入力
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        className="h-4 w-4 accent-[hsl(var(--primary))]"
                        checked={form.storeMode === "fixed"}
                        onChange={() => set({ storeMode: "fixed" })}
                      />
                      指定する
                    </label>
                    {form.storeMode === "fixed" && (
                      <span className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          value={form.storeCount}
                          onChange={(e) =>
                            set({ storeCount: Math.max(1, Math.round(Number(e.target.value)) || 1) })
                          }
                          className="w-20"
                        />
                        店舗
                      </span>
                    )}
                  </div>
                </Field>

                <div className="rounded-md border border-border p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={form.useCustomPrice}
                      onChange={(e) => set({ useCustomPrice: e.target.checked })}
                    />
                    個別価格にする（特別待遇・キャンペーンなど）
                  </label>
                  {form.useCustomPrice && plan && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="初期費用（税抜）" hint={`空欄 = プラン通り（${formatJPY(plan.initialFee)}）`}>
                        <Input
                          type="number"
                          min={0}
                          value={form.initialFeeOverride}
                          onChange={(e) => set({ initialFeeOverride: e.target.value })}
                        />
                      </Field>
                      <Field
                        label="月額 基本料金（税抜・1店舗）"
                        hint={`空欄 = プラン通り（${formatJPY(plan.amount)}）`}
                      >
                        <Input
                          type="number"
                          min={0}
                          value={form.monthlyPriceOverride}
                          onChange={(e) => set({ monthlyPriceOverride: e.target.value })}
                        />
                      </Field>
                    </div>
                  )}
                </div>

                {quote && (
                  <div className="rounded-md bg-muted/50 px-3 py-2.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">初期費用</span>
                      <span className="tabular font-medium">
                        {formatJPY(quote.initialFee)}（税込 {formatJPY(quote.initialFeeWithTax)}）
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">
                        月額{form.storeMode === "fixed" ? `（${quote.storeCount}店舗）` : "（1店舗あたり）"}
                      </span>
                      <span className="tabular font-medium">
                        {formatJPY(quote.monthlyTotal)}（税込 {formatJPY(quote.monthlyTotalWithTax)}）
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            {(mode !== "referral" || form.agencyId) && agencies.length > 0 && (
              <div className="space-y-3 rounded-md border border-border p-3">
                <div className="text-sm font-medium">代理店（代理店経由の案件のときだけ）</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="代理店">
                    <Select
                      value={form.agencyId}
                      onChange={(e) => onAgencyChange(e.target.value)}
                      disabled={lockedAgency}
                    >
                      <option value="">なし（直接のお客様）</option>
                      {agencies
                        .filter((a) => a.active || a.id === form.agencyId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  {form.agencyId && (
                    <Field label="営業担当（任意）">
                      <Select
                        value={form.agencyMemberId}
                        onChange={(e) => set({ agencyMemberId: e.target.value })}
                      >
                        <option value="">指定なし</option>
                        {agencyMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                </div>
                {form.agencyId && (
                  <Field label="区分（報酬）">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {AGENCY_DEAL_TYPE_KEYS.map((t) => (
                        <ModeOption
                          key={t}
                          active={form.agencyDealType === t}
                          onClick={() => set({ agencyDealType: t })}
                          title={`${AGENCY_DEAL_TYPES[t].label}（${agencyRateLabel(t)}）`}
                          body={AGENCY_DEAL_TYPES[t].scope}
                        />
                      ))}
                    </div>
                  </Field>
                )}
                {form.agencyId && form.withContract && (
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                      checked={form.allowInquiry}
                      onChange={(e) => set({ allowInquiry: e.target.checked })}
                    />
                    <span>
                      「まずは相談したい」の入口を出す
                      <span className="block text-xs text-muted-foreground">
                        お客様が連絡先と希望日時だけを送れます（紹介・問い合わせの一覧に届きます）。取次型の代理店におすすめ。
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}

            <Field label="有効期限" hint="期限を過ぎたURLからは申し込めなくなります。">
              <Select
                value={String(form.expiryDays)}
                onChange={(e) => set({ expiryDays: Number(e.target.value) })}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                キャンセル
              </Button>
              <Button
                onClick={submit}
                disabled={pending || !form.name.trim() || (form.withContract && !form.planId)}
              >
                <FileSignature className="h-4 w-4" />
                {pending ? "発行中…" : "URLを発行する"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

function ModeOption({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border p-3 text-left transition-colors",
        active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50",
      )}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{body}</div>
    </button>
  );
}

function toNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** お渡しするときの案内文(LINE・メールにそのまま貼れる) */
function guideMessage(params: {
  mode: "customer" | "agency" | "referral";
  url: string;
  name: string;
  orgName: string;
  agency: Agency | null;
  dealType: AgencyDealType;
  withContract: boolean;
  allowInquiry: boolean;
}): string {
  const { mode, url, name, orgName, agency, dealType, withContract, allowInquiry } = params;
  if (mode === "agency" && agency) {
    return [
      `${agency.name} 様`,
      "",
      `${orgName} の代理店用お申込みURLをお送りします。お客様にこのURL（またはQRコード）をお渡しください。`,
      allowInquiry
        ? "・「まずは相談したい」… お客様の連絡先とご希望の日時を受け付け、当社からご連絡します"
        : null,
      "・「このまま申し込む」… お客様情報の入力 → 料金のご確認 → 契約内容の確認・電子署名まで完了します",
      "",
      `このURLからのお申込みは ${agency.name} 様経由として自動で記録され、受注確定後に代理店報酬（${AGENCY_DEAL_TYPES[dealType].label}・${agencyRateLabel(dealType)}）を計上します。報酬はお客様の初期費用のご入金を確認した月の明細でお知らせします。`,
      "",
      url,
    ]
      .filter((l) => l !== null)
      .join("\n");
  }
  return [
    `${name.replace(/様$/, "")} 様`,
    "",
    withContract
      ? `${orgName} のお申込み・ご契約ページをお送りします。下記URLから、お客様情報の入力 → 料金のご確認 → 契約内容のご確認・電子署名まで、5分ほどで完了します。`
      : `${orgName} のお申込みフォームをお送りします。下記URLからお申込み内容をご入力ください。`,
    "",
    url,
    "",
    "ご不明な点がございましたら、お気軽にご連絡ください。",
    orgName,
  ].join("\n");
}
