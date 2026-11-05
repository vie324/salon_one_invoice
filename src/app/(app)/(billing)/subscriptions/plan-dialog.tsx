"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createPlanAction, updatePlanAction } from "@/app/actions/subscriptions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Label, Select } from "@/components/ui/input";
import { normalizeStoreTiers, priceGroupsTotal, storePriceGroups } from "@/lib/domain/calculations";
import { TAX_RATE_OPTIONS } from "@/lib/domain/constants";
import { describePriceGroups } from "@/lib/domain/pricing";
import type { Plan, PlanOption, PlanTerm, StoreTier } from "@/lib/domain/types";
import { formatJPY, genId } from "@/lib/utils";

type OptionRow = { key: string; name: string; monthly: number };
/** 店舗数による割引の1段(入力中)。金額の空欄 = その項目は前の段(無ければ通常)の金額のまま */
type TierRow = { key: string; fromStore: string; initialFee: string; monthly: string };

const tierRowsOf = (tiers: StoreTier[] | undefined): TierRow[] =>
  (tiers ?? []).map((t) => ({
    key: genId("tier"),
    fromStore: String(t.fromStore),
    initialFee: t.initialFee == null ? "" : String(t.initialFee),
    monthly: t.monthly == null ? "" : String(t.monthly),
  }));

/** 入力中の段を確かめて StoreTier にする(問題があればその説明) */
function parseTierRows(rows: TierRow[]): { tiers: StoreTier[] } | { error: string } {
  const seen = new Set<number>();
  const tiers: StoreTier[] = [];
  for (const r of rows) {
    const from = Number(r.fromStore);
    if (!Number.isInteger(from) || from < 2 || from > 99) {
      return { error: "店舗数による割引の「○店舗目以降」は 2〜99 で入力してください。" };
    }
    if (seen.has(from)) return { error: `店舗数による割引に「${from}店舗目以降」が2つあります。` };
    seen.add(from);
    const amount = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));
    const initialFee = amount(r.initialFee);
    const monthly = amount(r.monthly);
    if ([initialFee, monthly].some((v) => v != null && (!Number.isFinite(v) || v < 0))) {
      return { error: `${from}店舗目以降の金額は0円以上で入力してください。` };
    }
    if (initialFee == null && monthly == null) {
      return { error: `${from}店舗目以降の初期費用か月額を入れてください（使わない段は削除してください）。` };
    }
    tiers.push({ fromStore: from, initialFee, monthly });
  }
  return { tiers: normalizeStoreTiers(tiers) };
}

export function PlanFormDialog({
  open,
  onClose,
  plan,
}: {
  open: boolean;
  onClose: () => void;
  plan?: Plan;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(plan?.name ?? "");
  const [term, setTerm] = React.useState<PlanTerm>(plan?.term ?? "monthly");
  const [amount, setAmount] = React.useState(plan?.amount ?? 30000);
  const [initialFee, setInitialFee] = React.useState(plan?.initialFee ?? 200000);
  const [taxRate, setTaxRate] = React.useState(plan?.taxRate ?? 0.1);
  const [billingDay, setBillingDay] = React.useState(plan?.billingDay ?? 27);
  const [options, setOptions] = React.useState<OptionRow[]>(
    plan?.options.map((o) => ({ ...o })) ?? [],
  );
  const [tierRows, setTierRows] = React.useState<TierRow[]>(tierRowsOf(plan?.storeTiers));

  // ダイアログを開き直したときに初期値を反映
  React.useEffect(() => {
    if (!open) return;
    setName(plan?.name ?? "");
    setTerm(plan?.term ?? "monthly");
    setAmount(plan?.amount ?? 30000);
    setInitialFee(plan?.initialFee ?? 200000);
    setTaxRate(plan?.taxRate ?? 0.1);
    setBillingDay(plan?.billingDay ?? 27);
    setOptions(plan?.options.map((o) => ({ ...o })) ?? []);
    setTierRows(tierRowsOf(plan?.storeTiers));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addOption = () =>
    setOptions((o) => [...o, { key: genId("opt"), name: "", monthly: 0 }]);
  const updateOption = (i: number, patch: Partial<OptionRow>) =>
    setOptions((o) => o.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeOption = (i: number) => setOptions((o) => o.filter((_, idx) => idx !== i));

  const addTier = () =>
    setTierRows((rows) => {
      const last = rows.reduce((m, r) => Math.max(m, Number(r.fromStore) || 1), 1);
      return [...rows, { key: genId("tier"), fromStore: String(Math.min(99, last + 1)), initialFee: "", monthly: "" }];
    });
  const updateTier = (i: number, patch: Partial<TierRow>) =>
    setTierRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeTier = (i: number) => setTierRows((rows) => rows.filter((_, idx) => idx !== i));

  // 割引の見本(入力途中でも、読める段だけで計算する)
  const previewTiers = normalizeStoreTiers(
    tierRows.map((r) => ({
      fromStore: Number(r.fromStore),
      initialFee: r.initialFee.trim() === "" ? null : Number(r.initialFee),
      monthly: r.monthly.trim() === "" ? null : Number(r.monthly),
    })),
  );
  const previewStores = Math.max(3, ...previewTiers.map((t) => t.fromStore));
  const previewInitial = storePriceGroups(initialFee, previewTiers, "initialFee", previewStores);
  const previewMonthly = storePriceGroups(amount, previewTiers, "monthly", previewStores);

  const submit = () => {
    setError(null);
    if (!name.trim()) return setError("プラン名を入力してください。");
    const cleanOptions: PlanOption[] = options
      .filter((o) => o.name.trim())
      .map((o) => ({ key: o.key || genId("opt"), name: o.name.trim(), monthly: o.monthly }));

    const parsed = parseTierRows(tierRows);
    if ("error" in parsed) return setError(parsed.error);

    const input = {
      name,
      description: plan?.description ?? "",
      amount,
      taxRate,
      billingDay,
      initialFee,
      term,
      options: cleanOptions,
      storeTiers: parsed.tiers,
    };
    start(async () => {
      const res = plan
        ? await updatePlanAction(plan.id, input)
        : await createPlanAction(input);
      if (res.ok) {
        onClose();
        router.refresh();
      } else setError(res.error ?? "保存に失敗しました。");
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={plan ? "プランを編集" : "新規プラン"}
      description="基本料金・初期費用・オプションを設定します。金額は税抜・1店舗あたりで入力してください（請求は店舗ごとの金額の合計）。"
    >
      <div className="space-y-4">
        <Field label="プラン名">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="定価 / まとめパック 等" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="契約区分">
            <Select value={term} onChange={(e) => setTerm(e.target.value as PlanTerm)}>
              <option value="monthly">月額</option>
              <option value="annual">年間</option>
            </Select>
          </Field>
          <Field label="消費税">
            <Select value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}>
              {TAX_RATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="初期費用（税抜・1店舗あたり）">
            <Input type="number" value={initialFee} onChange={(e) => setInitialFee(Number(e.target.value))} />
          </Field>
          <Field label="基本料金 月額（税抜）">
            <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">オプション（税抜）</Label>
            <Button type="button" variant="outline" size="sm" onClick={addOption}>
              <Plus className="h-3.5 w-3.5" />
              追加
            </Button>
          </div>
          {options.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
              オプションはありません。「追加」で HPB・ミニモ連携 / LINE連携 などを設定できます。
            </p>
          ) : (
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={o.key} className="flex items-center gap-2">
                  <Input
                    value={o.name}
                    onChange={(e) => updateOption(i, { name: e.target.value })}
                    placeholder="オプション名（例: HPB・ミニモ連携）"
                    className="flex-1"
                  />
                  <div className="relative w-32">
                    <Input
                      type="number"
                      value={o.monthly}
                      onChange={(e) => updateOption(i, { monthly: Number(e.target.value) })}
                      className="pr-8"
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      /月
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">店舗数による割引（税抜・1店舗あたり）</Label>
            <Button type="button" variant="outline" size="sm" onClick={addTier}>
              <Plus className="h-3.5 w-3.5" />
              段を追加
            </Button>
          </div>
          {tierRows.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">
              割引はありません（全店舗が上の金額）。「段を追加」で「2店舗目以降は○円」のように設定できます。
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[6.5rem_1fr_1fr_1.25rem] gap-2 text-[11px] text-muted-foreground">
                <span>何店舗目から</span>
                <span>初期費用</span>
                <span>月額 基本料金</span>
                <span />
              </div>
              {tierRows.map((r, i) => (
                <div key={r.key} className="grid grid-cols-[6.5rem_1fr_1fr_1.25rem] items-center gap-2">
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={99}
                      value={r.fromStore}
                      onChange={(e) => updateTier(i, { fromStore: e.target.value })}
                      className="w-14 px-2 text-center"
                      aria-label="何店舗目から"
                    />
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">店舗目〜</span>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    value={r.initialFee}
                    onChange={(e) => updateTier(i, { initialFee: e.target.value })}
                    placeholder="変えない"
                    aria-label="初期費用（1店舗あたり）"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={r.monthly}
                    onChange={(e) => updateTier(i, { monthly: e.target.value })}
                    placeholder="変えない"
                    aria-label="月額 基本料金（1店舗あたり）"
                  />
                  <button
                    type="button"
                    onClick={() => removeTier(i)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="段を削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                空欄の項目は前の段（無ければ上の金額）のままです。オプションは割引しません。
                プランを変えても、締結済みの契約・登録済みの毎月の請求の金額は変わりません（契約したときの金額で残ります）。
              </p>
              {previewTiers.length > 0 && (
                <div className="rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed">
                  <div className="font-medium">例）{previewStores}店舗の場合</div>
                  <div className="text-muted-foreground">
                    初期費用 {formatJPY(priceGroupsTotal(previewInitial))}（{describePriceGroups(previewInitial)}）
                  </div>
                  <div className="text-muted-foreground">
                    月額 基本料金 {formatJPY(priceGroupsTotal(previewMonthly))}（{describePriceGroups(previewMonthly)}）
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
          フル導入時（基本＋全オプション）:{" "}
          <strong className="tabular">
            {formatJPY(amount + options.reduce((s, o) => s + (o.monthly || 0), 0))}
          </strong>
          （税抜）/ 月
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {plan ? "保存" : "プランを作成"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** 既存プランの編集ボタン(プランカードに配置) */
export function PlanEditButton({ plan }: { plan: Plan }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
      >
        <Pencil className="h-3.5 w-3.5" />
        編集
      </button>
      <PlanFormDialog open={open} onClose={() => setOpen(false)} plan={plan} />
    </>
  );
}

/** 新規プラン作成ボタン */
export function NewPlanButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        新規プラン
      </Button>
      <PlanFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
