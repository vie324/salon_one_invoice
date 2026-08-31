"use client";

import * as React from "react";
import {
  createDevScheduleItemAction,
  deleteDevScheduleItemAction,
  updateDevScheduleItemAction,
} from "@/app/actions/dev-schedule";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  DEV_SCHEDULE_CATEGORIES,
  DEV_SCHEDULE_PRIORITY_MAX,
  DEV_SCHEDULE_PRIORITY_MIN,
  devScheduleStatusLabels,
} from "@/lib/domain/constants";
import { parseIssueNumbers } from "@/lib/domain/dev-schedule";
import type { DevScheduleStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** ダイアログが扱う1件分の入力値 */
export interface ScheduleItemDraft {
  id: string | null;
  category: string;
  title: string;
  priority: number;
  status: DevScheduleStatus;
  targetMonth: string;
  targetDate: string;
  confirmed: boolean;
  note: string;
  /** 「#143/#156」のような自由入力。開発MTGで送られてくる形をそのまま貼れる。 */
  issueNumbers: string;
}

export function emptyDraft(targetMonth = ""): ScheduleItemDraft {
  return {
    id: null,
    category: "",
    title: "",
    priority: 3,
    status: "planned",
    targetMonth,
    targetDate: "",
    confirmed: false,
    note: "",
    issueNumbers: "",
  };
}

const STATUSES: DevScheduleStatus[] = ["planned", "in_progress", "done", "dropped"];

/** 機能の追加・編集。連動する依頼は番号(#143)で指定する。 */
export function ScheduleItemDialog({
  draft,
  onClose,
}: {
  draft: ScheduleItemDraft | null;
  onClose: () => void;
}) {
  const [form, setForm] = React.useState<ScheduleItemDraft>(draft ?? emptyDraft());
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (draft) {
      setForm(draft);
      setError("");
      setNotice("");
      setConfirmDelete(false);
    }
  }, [draft]);

  const set = <K extends keyof ScheduleItemDraft>(key: K, value: ScheduleItemDraft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    setError("");
    setNotice("");
    const payload = {
      category: form.category,
      title: form.title,
      priority: form.priority,
      status: form.status,
      targetMonth: form.targetMonth || null,
      targetDate: form.targetDate || null,
      confirmed: form.confirmed,
      note: form.note,
      issueNumbers: parseIssueNumbers(form.issueNumbers),
    };
    startTransition(async () => {
      const res = form.id
        ? await updateDevScheduleItemAction(form.id, payload)
        : await createDevScheduleItemAction(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // 存在しない番号があっても登録自体は通す(番号の打ち間違いを知らせるだけ)
      if (res.missing.length > 0) {
        setNotice(
          `#${res.missing.join("・#")} は開発進捗に見つからなかったため連動していません`,
        );
        return;
      }
      onClose();
    });
  };

  const remove = () => {
    if (!form.id) return;
    startTransition(async () => {
      const res = await deleteDevScheduleItemAction(form.id!);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
    });
  };

  return (
    <Dialog
      open={!!draft}
      onClose={onClose}
      title={form.id ? "機能を編集" : "機能を追加"}
      description="スプレッドシートの1行にあたります。連動させる依頼は #143 のように番号で指定できます。"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="カテゴリ">
            <Input
              list="dev-schedule-categories"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="基盤 / 分析 / 人事 …"
            />
            <datalist id="dev-schedule-categories">
              {DEV_SCHEDULE_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="状況">
            <Select
              value={form.status}
              onChange={(e) => set("status", e.target.value as DevScheduleStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {devScheduleStatusLabels[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="機能名">
          <Input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="勤怠管理"
            autoFocus
          />
        </Field>

        <Field label="優先度" hint="★の数。スプレッドシートと同じ5段階です。">
          <StarPicker value={form.priority} onChange={(v) => set("priority", v)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="対応する月" hint="表の列になります。">
            <Input
              type="month"
              value={form.targetMonth}
              onChange={(e) => set("targetMonth", e.target.value)}
            />
          </Field>
          <Field label="目安日" hint="この日を含む週が「今週進める分」に出ます。">
            <Input
              type="date"
              value={form.targetDate}
              onChange={(e) => set("targetDate", e.target.value)}
            />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-2.5 text-sm transition-colors hover:bg-muted/50">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
            checked={form.confirmed}
            onChange={(e) => set("confirmed", e.target.checked)}
          />
          <span>
            <span className="font-medium">日程が確定している（★）</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              外すと未確定（☆）として、控えめな表示になります。
            </span>
          </span>
        </label>

        <Field
          label="連動する開発進捗"
          hint="開発MTGで送っている番号をそのまま貼れます（例: #143/#156/#138）。"
        >
          <Textarea
            value={form.issueNumbers}
            onChange={(e) => set("issueNumbers", e.target.value)}
            placeholder="#143/#156/#138"
            className="min-h-[64px]"
          />
        </Field>

        <Field label="メモ" hint="「酒井モック」など、表に小さく添える補足。">
          <Input
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="酒井モック"
          />
        </Field>

        {notice && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            {notice}
          </p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={submit} disabled={pending || !form.title.trim()}>
            {form.id ? "保存" : "追加"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          {form.id && (
            <div className="ml-auto">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">削除しますか？</span>
                  <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
                    削除する
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={pending}
                  >
                    やめる
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  disabled={pending}
                  className="text-destructive"
                >
                  この機能を削除
                </Button>
              )}
            </div>
          )}
        </div>
        {form.id && (
          <p className="text-xs text-muted-foreground">
            削除しても、連動している開発進捗の依頼はそのまま残ります。
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** ★を押して優先度を選ぶ */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const stars = Array.from(
    { length: DEV_SCHEDULE_PRIORITY_MAX - DEV_SCHEDULE_PRIORITY_MIN + 1 },
    (_, i) => i + DEV_SCHEDULE_PRIORITY_MIN,
  );
  return (
    <div className="flex items-center gap-1">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`優先度 ${n}`}
          aria-pressed={value === n}
          className={cn(
            "inline-flex h-9 w-8 items-center justify-center rounded-md text-lg leading-none transition-colors",
            n <= value ? "text-warning" : "text-muted-foreground/40 hover:text-muted-foreground",
          )}
        >
          {n <= value ? "★" : "☆"}
        </button>
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{value} / 5</span>
    </div>
  );
}
