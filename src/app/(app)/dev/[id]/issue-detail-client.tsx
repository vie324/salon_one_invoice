"use client";

import { Ban, Check, Pencil, RotateCcw, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { setDevIssueApprovalAction, updateDevIssueAction } from "@/app/actions/dev-issues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  DEV_EXECUTION_REQUIRED_APPROVALS,
  devIssueCategoryLabels,
  devIssueExecutionLabels,
  devIssuePriorityLabels,
  devIssueStatusLabels,
} from "@/lib/domain/constants";
import type {
  DevIssueApproval,
  DevIssueCategory,
  DevIssueExecution,
  DevIssuePriority,
  DevIssueStatus,
} from "@/lib/domain/types";
import { formatDateTime } from "@/lib/utils";

/** エンジニア入力欄(ステータス・完了予定日・完了日・開発対応内容) */
export function EngineerForm({
  issueId,
  status,
  scheduledDate,
  completedDate,
  devNote,
}: {
  issueId: string;
  status: DevIssueStatus;
  scheduledDate: string | null;
  completedDate: string | null;
  devNote: string;
}) {
  const router = useRouter();
  const [s, setS] = React.useState<DevIssueStatus>(status);
  const [sched, setSched] = React.useState(scheduledDate ?? "");
  const [comp, setComp] = React.useState(completedDate ?? "");
  const [note, setNote] = React.useState(devNote);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateDevIssueAction(issueId, {
        status: s,
        scheduledDate: sched || null,
        completedDate: comp || null,
        devNote: note,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" />
        <CardTitle>エンジニア対応</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <Field label="ステータス">
            <Select value={s} onChange={(e) => setS(e.target.value as DevIssueStatus)}>
              <option value="open">{devIssueStatusLabels.open}</option>
              <option value="in_progress">{devIssueStatusLabels.in_progress}</option>
              <option value="hearing">{devIssueStatusLabels.hearing}</option>
              <option value="done">{devIssueStatusLabels.done}</option>
            </Select>
          </Field>
          <Field label="対応完了予定日">
            <Input type="date" value={sched} onChange={(e) => setSched(e.target.value)} />
          </Field>
          <Field label="対応完了日" hint="「対応完了」で保存すると未入力でも当日が記録されます。">
            <Input type="date" value={comp} onChange={(e) => setComp(e.target.value)} />
          </Field>
          <Field label="開発対応内容（追記）">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="対応方針・実装内容・確認依頼など"
            />
          </Field>
          {s === "hearing" && (
            <p className="rounded-md bg-info/10 px-3 py-2 text-xs text-info">
              追加ヒアリングで保存すると、依頼者に通知が届きます。確認したい内容を「開発対応内容」に記載してください。
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && !error && <p className="text-sm text-success">保存しました。</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** 実行有無の判定パネル(要望のみ)。プロダクト管理者2名の承諾で「実行」。 */
export function ApprovalPanel({
  issueId,
  execution,
  approvals,
  currentUserId,
  isAdmin,
}: {
  issueId: string;
  execution: DevIssueExecution;
  approvals: DevIssueApproval[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const mine = approvals.find((a) => a.approverId === currentUserId);
  const approveCount = approvals.filter((a) => a.decision === "approve").length;

  const act = (decision: "approve" | "reject" | null) =>
    startTransition(async () => {
      setError(null);
      const res = await setDevIssueApprovalAction(issueId, decision);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>実行有無（要望の実行判定）</CardTitle>
        <Badge
          tone={execution === "approved" ? "primary" : execution === "rejected" ? "danger" : "neutral"}
        >
          {devIssueExecutionLabels[execution]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          プロダクト管理者{DEV_EXECUTION_REQUIRED_APPROVALS}名の承諾で「実行」になります。どちらか1名が停止した場合は「実行なし」です。
          （承諾 {approveCount}/{DEV_EXECUTION_REQUIRED_APPROVALS}）
        </p>

        {approvals.length > 0 ? (
          <ul className="space-y-2">
            {approvals.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium">
                  {a.approverName}
                  {a.approverId === currentUserId && (
                    <span className="ml-1 text-xs text-muted-foreground">(自分)</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={a.decision === "approve" ? "success" : "danger"}>
                    {a.decision === "approve" ? "承諾" : "停止"}
                  </Badge>
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    {formatDateTime(a.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">まだ判定はありません。</p>
        )}

        {isAdmin ? (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="success"
                size="sm"
                disabled={pending || mine?.decision === "approve"}
                onClick={() => act("approve")}
              >
                <Check className="h-4 w-4" />
                承諾する
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={pending || mine?.decision === "reject"}
                onClick={() => act("reject")}
              >
                <Ban className="h-4 w-4" />
                停止する
              </Button>
            </div>
            {mine && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                disabled={pending}
                onClick={() => act(null)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                自分の判定を取り消す
              </Button>
            )}
          </div>
        ) : (
          <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">
            判定はプロダクト管理者（全体管理者）のみ行えます。
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

/** 依頼内容の編集(依頼者本人・全体管理者のみ表示される) */
export function RequestEditForm({
  issueId,
  title,
  detail,
  category,
  priority,
}: {
  issueId: string;
  title: string;
  detail: string;
  category: DevIssueCategory;
  priority: DevIssuePriority;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [t, setT] = React.useState(title);
  const [d, setD] = React.useState(detail);
  const [c, setC] = React.useState<DevIssueCategory>(category);
  const [p, setP] = React.useState<DevIssuePriority>(priority);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateDevIssueAction(issueId, {
        title: t,
        detail: d,
        category: c,
        priority: p,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        依頼内容を編集
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>依頼内容を編集</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <Field label="課題名">
            <Input value={t} onChange={(e) => setT(e.target.value)} required maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="分類">
              <Select value={c} onChange={(e) => setC(e.target.value as DevIssueCategory)}>
                <option value="bug">{devIssueCategoryLabels.bug}</option>
                <option value="request">{devIssueCategoryLabels.request}</option>
              </Select>
            </Field>
            <Field label="優先度">
              <Select value={p} onChange={(e) => setP(e.target.value as DevIssuePriority)}>
                <option value="high">{devIssuePriorityLabels.high}</option>
                <option value="medium">{devIssuePriorityLabels.medium}</option>
                <option value="low">{devIssuePriorityLabels.low}</option>
              </Select>
            </Field>
          </div>
          <Field label="詳細">
            <Textarea value={d} onChange={(e) => setD(e.target.value)} rows={8} />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中…" : "保存"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
