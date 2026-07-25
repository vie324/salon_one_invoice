"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { createDevIssueAction } from "@/app/actions/dev-issues";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  devIssueCategoryLabels,
  devIssuePriorityLabels,
} from "@/lib/domain/constants";
import type { DevIssueCategory, DevIssuePriority } from "@/lib/domain/types";

export function NewIssueForm() {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<DevIssueCategory>("bug");
  const [priority, setPriority] = React.useState<DevIssuePriority>("medium");
  const [detail, setDetail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createDevIssueAction({ title, category, priority, detail });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/dev/${res.id}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="課題名（修正や不具合のタイトル）">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 継続決済が会計処理できない（千葉院）"
          required
          maxLength={200}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="分類">
          <Select value={category} onChange={(e) => setCategory(e.target.value as DevIssueCategory)}>
            <option value="bug">{devIssueCategoryLabels.bug}</option>
            <option value="request">{devIssueCategoryLabels.request}</option>
          </Select>
        </Field>
        <Field label="優先度">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as DevIssuePriority)}>
            <option value="high">{devIssuePriorityLabels.high}</option>
            <option value="medium">{devIssuePriorityLabels.medium}</option>
            <option value="low">{devIssuePriorityLabels.low}</option>
          </Select>
        </Field>
      </div>
      <Field
        label="詳細（修正や不具合の中身）"
        hint="再現手順・発生店舗・希望する動作など、わかる範囲で具体的に記載してください。"
      >
        <Textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={8}
          placeholder={"例:\n・7/3の継続決済が会計処理できない\n・対象: 千葉院\n・エラー画面のスクリーンショットあり"}
        />
      </Field>
      {category === "request" && (
        <p className="rounded-md bg-secondary px-3 py-2.5 text-xs text-secondary-foreground">
          要望は、プロダクト管理者2名の承諾で「実行」になります（どちらか1名が停止した場合は「実行なし」）。
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "登録中…" : "依頼を登録"}
        </Button>
      </div>
    </form>
  );
}
