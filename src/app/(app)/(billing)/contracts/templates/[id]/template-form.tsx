"use client";

import { Plus, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { updateContractTemplateAction } from "@/app/actions/contracts";
import {
  FeeTablesEditor,
  PartyEditor,
  SectionsEditor,
} from "@/components/contracts/editors";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import type {
  ContractFeeTable,
  ContractParty,
  ContractSection,
  ContractTemplate,
} from "@/lib/domain/types";

/** 契約書テンプレートの編集フォーム。保存すると版(version)が上がる。 */
export function TemplateForm({ template }: { template: ContractTemplate }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState(template.name);
  const [description, setDescription] = React.useState(template.description);
  const [docTitle, setDocTitle] = React.useState(template.docTitle);
  const [preamble, setPreamble] = React.useState(template.preamble);
  const [providerDefault, setProviderDefault] = React.useState<ContractParty>(
    template.providerDefault,
  );
  const [sections, setSections] = React.useState<ContractSection[]>(template.sections);
  const [feeTables, setFeeTables] = React.useState<ContractFeeTable[]>(template.feeTables);
  const [active, setActive] = React.useState(template.active);

  const addSection = () =>
    setSections((prev) => [...prev, { title: `第${prev.length + 1}条　（　）`, body: "" }]);
  const addFeeTable = () =>
    setFeeTables((prev) => [...prev, { title: "■ 料金表", rows: [{ item: "", amount: "" }] }]);

  const submit = () =>
    start(async () => {
      setError(null);
      if (!name.trim() || !docTitle.trim()) {
        setError("テンプレート名と書面タイトルを入力してください");
        return;
      }
      const res = await updateContractTemplateAction(template.id, {
        name: name.trim(),
        description,
        docTitle: docTitle.trim(),
        preamble,
        providerDefault,
        sections,
        feeTables,
        active,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/contracts/templates");
      router.refresh();
    });

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">基本情報</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="テンプレート名">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="書面タイトル">
            <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
          </Field>
          <Field label="説明" className="sm:col-span-2">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="前文" className="sm:col-span-2">
            <Textarea
              value={preamble}
              onChange={(e) => setPreamble(e.target.value)}
              className="min-h-[100px]"
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-primary)]"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            有効（契約作成時に選択可能にする）
          </label>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold">甲（サービス提供者）の既定値</h2>
        <div className="max-w-2xl">
          <PartyEditor label="【甲】サービス提供者" party={providerDefault} onChange={setProviderDefault} />
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            既定の料金表（本文の {"{{料金表}}"} の位置に表示）
          </h2>
          <Button variant="outline" size="sm" onClick={addFeeTable}>
            <Plus className="h-4 w-4" />
            表を追加
          </Button>
        </div>
        <FeeTablesEditor feeTables={feeTables} onChange={setFeeTables} />
      </Card>

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

      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-lg border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
        {error && <p className="mr-auto text-sm text-destructive">{error}</p>}
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          キャンセル
        </Button>
        <Button onClick={submit} disabled={pending}>
          <Save className="h-4 w-4" />
          保存（v{template.version + 1} へ更新）
        </Button>
      </div>
    </div>
  );
}
