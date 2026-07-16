"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import type {
  ContractFeeTable,
  ContractParty,
  ContractSection,
} from "@/lib/domain/types";

/** 当事者(甲/乙)の入力欄。契約フォーム・テンプレート編集で共用。 */
export function PartyEditor({
  label,
  party,
  onChange,
  emailHint,
}: {
  label: string;
  party: ContractParty;
  onChange: (p: ContractParty) => void;
  emailHint?: string;
}) {
  const set = (patch: Partial<ContractParty>) => onChange({ ...party, ...patch });
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <Field label="会社名 / 屋号">
        <Input value={party.name} onChange={(e) => set({ name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="郵便番号">
          <Input
            value={party.postalCode}
            onChange={(e) => set({ postalCode: e.target.value })}
          />
        </Field>
        <Field label="住所" className="col-span-2">
          <Input value={party.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="代表者 / 署名者">
          <Input
            value={party.representative}
            onChange={(e) => set({ representative: e.target.value })}
          />
        </Field>
        <Field label="メールアドレス" hint={emailHint}>
          <Input value={party.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

/** 料金表(複数)の編集。 */
export function FeeTablesEditor({
  feeTables,
  onChange,
}: {
  feeTables: ContractFeeTable[];
  onChange: React.Dispatch<React.SetStateAction<ContractFeeTable[]>>;
}) {
  const updateTable = (ti: number, patch: Partial<ContractFeeTable>) =>
    onChange((prev) => prev.map((t, idx) => (idx === ti ? { ...t, ...patch } : t)));
  const updateRow = (
    ti: number,
    ri: number,
    patch: Partial<ContractFeeTable["rows"][number]>,
  ) =>
    onChange((prev) =>
      prev.map((t, idx) =>
        idx === ti
          ? { ...t, rows: t.rows.map((r, rIdx) => (rIdx === ri ? { ...r, ...patch } : r)) }
          : t,
      ),
    );
  const addRow = (ti: number) =>
    onChange((prev) =>
      prev.map((t, idx) =>
        idx === ti ? { ...t, rows: [...t.rows, { item: "", amount: "" }] } : t,
      ),
    );
  const removeRow = (ti: number, ri: number) =>
    onChange((prev) =>
      prev.map((t, idx) =>
        idx === ti ? { ...t, rows: t.rows.filter((_, rIdx) => rIdx !== ri) } : t,
      ),
    );
  const removeTable = (ti: number) => onChange((prev) => prev.filter((_, idx) => idx !== ti));

  return (
    <div className="space-y-5">
      {feeTables.map((table, ti) => (
        <div key={ti} className="rounded-md border border-border p-4">
          <div className="flex items-center gap-2">
            <Input
              value={table.title}
              onChange={(e) => updateTable(ti, { title: e.target.value })}
              className="font-medium"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeTable(ti)}
              aria-label="表を削除"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {table.rows.map((row, ri) => (
              <div key={ri} className="flex items-center gap-2">
                <Input
                  value={row.item}
                  onChange={(e) => updateRow(ti, ri, { item: e.target.value })}
                  placeholder="項目（例: 初期構築費用）"
                  className="w-[40%]"
                />
                <Input
                  value={row.amount}
                  onChange={(e) => updateRow(ti, ri, { amount: e.target.value })}
                  placeholder="金額（例: 100,000円）"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(ti, ri)}
                  aria-label="行を削除"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => addRow(ti)}>
              <Plus className="h-4 w-4" />
              行を追加
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 条文(章)の編集(並べ替え・追加・削除)。 */
export function SectionsEditor({
  sections,
  onChange,
}: {
  sections: ContractSection[];
  onChange: React.Dispatch<React.SetStateAction<ContractSection[]>>;
}) {
  const update = (i: number, patch: Partial<ContractSection>) =>
    onChange((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) =>
    onChange((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (i: number) => onChange((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-4">
      {sections.map((section, i) => (
        <div key={i} className="rounded-md border border-border p-4">
          <div className="flex items-center gap-2">
            <Input
              value={section.title}
              onChange={(e) => update(i, { title: e.target.value })}
              className="font-medium"
            />
            <div className="flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="上へ"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(i, 1)}
                disabled={i === sections.length - 1}
                aria-label="下へ"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="削除">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
          <Textarea
            value={section.body}
            onChange={(e) => update(i, { body: e.target.value })}
            className="mt-2 min-h-[120px] text-[13px] leading-relaxed"
          />
        </div>
      ))}
    </div>
  );
}
