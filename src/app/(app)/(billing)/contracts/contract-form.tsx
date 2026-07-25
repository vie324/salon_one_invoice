"use client";

import { Plus, Save, Send, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  createContractAction,
  updateContractDraftAction,
} from "@/app/actions/contracts";
import {
  FeeTablesEditor,
  PartyEditor,
  SectionsEditor,
} from "@/components/contracts/editors";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  feeTablesFromPlan,
  partyFromCustomer,
  termsFromPlan,
} from "@/lib/contracts/build";
import type {
  Contract,
  ContractFeeTable,
  ContractParty,
  ContractSection,
  ContractTemplate,
  ContractTerms,
  Customer,
  Plan,
} from "@/lib/domain/types";
import { subscriptionMonthly } from "@/lib/domain/calculations";
import { formatJPY } from "@/lib/utils";

const emptyParty: ContractParty = {
  name: "",
  postalCode: "",
  address: "",
  representative: "",
  email: "",
};

const emptyTerms: ContractTerms = {
  planId: null,
  planName: "",
  optionKeys: [],
  storeCount: 1,
  initialFee: null,
  monthlyFee: null,
  startDate: null,
  notes: "",
};

/**
 * 契約書の作成・編集フォーム(下書きのみ編集可)。
 * テンプレートから本文をコピーし、顧客・プランに応じて料金表や条文を編集できる。
 */
export function ContractForm({
  customers,
  plans,
  templates,
  initial,
  initialCustomerId,
}: {
  customers: Customer[];
  plans: Plan[];
  templates: ContractTemplate[];
  /** 編集時の既存契約(下書き) */
  initial?: Contract;
  /** 新規作成時のプリセット顧客(顧客詳細からの導線) */
  initialCustomerId?: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const defaultTemplate = templates[0] ?? null;
  const [templateId, setTemplateId] = React.useState<string>(
    initial?.templateId ?? defaultTemplate?.id ?? "",
  );

  const [customerId, setCustomerId] = React.useState(
    initial?.customerId ?? initialCustomerId ?? customers[0]?.id ?? "",
  );
  const [title, setTitle] = React.useState(
    initial?.title ?? defaultTemplate?.docTitle ?? "サービス利用契約書",
  );
  const [preamble, setPreamble] = React.useState(
    initial?.preamble ?? defaultTemplate?.preamble ?? "",
  );
  const [provider, setProvider] = React.useState<ContractParty>(
    initial?.provider ?? defaultTemplate?.providerDefault ?? emptyParty,
  );
  const [customerParty, setCustomerParty] = React.useState<ContractParty>(
    initial?.customerParty ??
      (customers.find((c) => c.id === (initialCustomerId ?? customers[0]?.id))
        ? partyFromCustomer(
            customers.find((c) => c.id === (initialCustomerId ?? customers[0]?.id))!,
          )
        : emptyParty),
  );
  const [sections, setSections] = React.useState<ContractSection[]>(
    initial?.sections ?? defaultTemplate?.sections ?? [],
  );
  const [feeTables, setFeeTables] = React.useState<ContractFeeTable[]>(
    initial?.feeTables ?? defaultTemplate?.feeTables ?? [],
  );
  const [terms, setTerms] = React.useState<ContractTerms>(initial?.terms ?? emptyTerms);

  const selectedPlan = plans.find((p) => p.id === terms.planId) ?? null;

  /* ---- 顧客変更 → 乙欄へ反映 ---- */
  const onCustomerChange = (id: string) => {
    setCustomerId(id);
    const cus = customers.find((c) => c.id === id);
    if (cus) setCustomerParty(partyFromCustomer(cus));
  };

  /* ---- テンプレート適用(新規のみ) ---- */
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTitle(tpl.docTitle);
    setPreamble(tpl.preamble);
    setSections(tpl.sections);
    setFeeTables(tpl.feeTables);
    setProvider(tpl.providerDefault);
  };

  /* ---- プラン変更 → 申込条件へ反映 ---- */
  const onPlanChange = (planId: string) => {
    if (!planId) {
      setTerms((t) => ({ ...t, planId: null, planName: "" }));
      return;
    }
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    setTerms((t) => ({
      ...termsFromPlan(plan, t.optionKeys.filter((k) => plan.options.some((o) => o.key === k)), t.storeCount, t.startDate),
      notes: t.notes,
    }));
  };

  const toggleOption = (key: string) => {
    if (!selectedPlan) return;
    setTerms((t) => {
      const optionKeys = t.optionKeys.includes(key)
        ? t.optionKeys.filter((k) => k !== key)
        : [...t.optionKeys, key];
      return {
        ...t,
        optionKeys,
        monthlyFee: subscriptionMonthly(selectedPlan, optionKeys) * t.storeCount,
      };
    });
  };

  const setStoreCount = (n: number) => {
    const count = Math.max(1, Math.round(n) || 1);
    setTerms((t) => ({
      ...t,
      storeCount: count,
      monthlyFee: selectedPlan
        ? subscriptionMonthly(selectedPlan, t.optionKeys) * count
        : t.monthlyFee,
    }));
  };

  const generateFeeTables = () => {
    if (!selectedPlan) return;
    setFeeTables(feeTablesFromPlan(selectedPlan, terms.optionKeys, terms.storeCount));
  };

  const addSection = () =>
    setSections((prev) => [...prev, { title: `第${prev.length + 1}条　（　）`, body: "" }]);
  const addFeeTable = () =>
    setFeeTables((prev) => [...prev, { title: "■ 料金表", rows: [{ item: "", amount: "" }] }]);

  /* ---- 保存 ---- */
  const submit = () =>
    start(async () => {
      setError(null);
      if (!customerId) return setError("顧客を選択してください");
      if (!title.trim()) return setError("契約書タイトルを入力してください");
      const tpl = templates.find((t) => t.id === templateId);
      const input = {
        customerId,
        templateId: templateId || null,
        templateVersion: tpl?.version ?? null,
        title: title.trim(),
        preamble,
        provider,
        customerParty,
        sections,
        feeTables,
        terms,
      };
      let id = initial?.id;
      if (initial) {
        const res = await updateContractDraftAction(initial.id, input);
        if (!res.ok) {
          setError(res.error);
          return;
        }
      } else {
        const res = await createContractAction(input);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        id = res.id;
      }
      router.push(`/contracts/${id}`);
      router.refresh();
    });

  return (
    <div className="space-y-6">
      {/* 基本情報 */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">基本情報</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="顧客(契約者)">
            <Select value={customerId} onChange={(e) => onCustomerChange(e.target.value)}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{c.code}）
                </option>
              ))}
            </Select>
          </Field>
          {!initial && (
            <Field label="テンプレート" hint="適用するとタイトル・条文・料金表が置き換わります">
              <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}（v{t.version}）
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="契約書タイトル" className="sm:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="前文" className="sm:col-span-2">
            <Textarea
              value={preamble}
              onChange={(e) => setPreamble(e.target.value)}
              className="min-h-[100px]"
            />
          </Field>
        </div>
      </Card>

      {/* 申込内容(プラン連携) */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">申込内容（プラン連携）</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={generateFeeTables}
            disabled={!selectedPlan}
            title="選択中のプラン内容から契約書の料金表を作り直します"
          >
            <Wand2 className="h-4 w-4" />
            プランから料金表を生成
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="プラン" hint="締結後の定期請求の自動作成に使われます">
            <Select
              value={terms.planId ?? ""}
              onChange={(e) => onPlanChange(e.target.value)}
            >
              <option value="">カスタム（プラン連携なし）</option>
              {plans
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{p.term === "annual" ? "年間" : "月額"}） {formatJPY(p.amount)}/月
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="契約店舗数">
            <Input
              type="number"
              min={1}
              value={terms.storeCount}
              onChange={(e) => setStoreCount(Number(e.target.value))}
            />
          </Field>
          <Field label="利用開始日(予定)">
            <Input
              type="date"
              value={terms.startDate ?? ""}
              onChange={(e) =>
                setTerms((t) => ({ ...t, startDate: e.target.value || null }))
              }
            />
          </Field>
          {selectedPlan && selectedPlan.options.length > 0 && (
            <div className="sm:col-span-3">
              <div className="mb-1.5 text-sm font-medium">オプション</div>
              <div className="flex flex-wrap gap-3">
                {selectedPlan.options.map((o) => (
                  <label
                    key={o.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-primary)]"
                      checked={terms.optionKeys.includes(o.key)}
                      onChange={() => toggleOption(o.key)}
                    />
                    {o.name}（{formatJPY(o.monthly)}/月）
                  </label>
                ))}
              </div>
            </div>
          )}
          <Field label="初期費用(税抜)" hint="検索・請求連携用">
            <Input
              type="number"
              value={terms.initialFee ?? ""}
              onChange={(e) =>
                setTerms((t) => ({
                  ...t,
                  initialFee: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
          </Field>
          <Field label="月額合計(税抜)">
            <Input
              type="number"
              value={terms.monthlyFee ?? ""}
              onChange={(e) =>
                setTerms((t) => ({
                  ...t,
                  monthlyFee: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
          </Field>
          <Field label="備考(申込内容)">
            <Input
              value={terms.notes}
              onChange={(e) => setTerms((t) => ({ ...t, notes: e.target.value }))}
              placeholder="例）マーケティング代行を含む"
            />
          </Field>
        </div>
      </Card>

      {/* 当事者 */}
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">当事者（署名欄の記載）</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <PartyEditor label="【甲】サービス提供者" party={provider} onChange={setProvider} />
          <PartyEditor
            label="【乙】契約者"
            party={customerParty}
            onChange={setCustomerParty}
            emailHint="署名依頼メールの既定の送付先になります"
          />
        </div>
      </Card>

      {/* 料金表 */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            料金表（本文の {"{{料金表}}"} の位置に表示されます）
          </h2>
          <Button variant="outline" size="sm" onClick={addFeeTable}>
            <Plus className="h-4 w-4" />
            表を追加
          </Button>
        </div>
        <FeeTablesEditor feeTables={feeTables} onChange={setFeeTables} />
      </Card>

      {/* 条文 */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">条文（{sections.length}条）</h2>
          <Button variant="outline" size="sm" onClick={addSection}>
            <Plus className="h-4 w-4" />
            条文を追加
          </Button>
        </div>
        <SectionsEditor sections={sections} onChange={setSections} />
      </Card>

      {/* 保存 */}
      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-lg border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
        {error && <p className="mr-auto text-sm text-destructive">{error}</p>}
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          キャンセル
        </Button>
        <Button onClick={submit} disabled={pending}>
          {initial ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {initial ? "下書きを保存" : "下書きとして作成"}
        </Button>
      </div>
    </div>
  );
}

