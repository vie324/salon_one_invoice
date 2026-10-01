"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { markBatchSubmittedAction, recordBatchResultsAction } from "@/app/actions/direct-debit";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { DEBIT_FAILURE_REASONS } from "@/lib/domain/constants";
import { cn, formatJPY } from "@/lib/utils";

/** ② NSS の収納サイトへ金額を登録したことを記録する */
export function MarkSubmittedButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const run = () => {
    if (!window.confirm("NSS の収納サイトへ、この一覧の金額を登録しましたか？")) return;
    start(async () => {
      setError(null);
      const res = await markBatchSubmittedAction(id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  };
  return (
    <div className="space-y-1">
      <Button className="w-full" onClick={run} disabled={pending}>
        <Send className="h-4 w-4" />
        NSSへ登録した
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export interface ResultRow {
  itemId: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
}

/**
 * ③ 引き落とし結果の反映。NSS の結果データを見ながら、引き落とせなかったものだけ
 * 「不可」にして理由を選ぶ(既定は全件「引き落とし済」)。
 */
export function ResultsForm({ id, rows }: { id: string; rows: ResultRow[] }) {
  const router = useRouter();
  const [failed, setFailed] = React.useState<Record<string, string>>({});
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const toggle = (itemId: string) =>
    setFailed((prev) => {
      const next = { ...prev };
      if (next[itemId] !== undefined) delete next[itemId];
      else next[itemId] = DEBIT_FAILURE_REASONS[0];
      return next;
    });

  const failedCount = Object.keys(failed).length;
  const successCount = rows.length - failedCount;

  const submit = () => {
    if (
      !window.confirm(
        `引き落とし済 ${successCount}件 / 不可 ${failedCount}件 として反映します。引き落とし済の請求は入金済みになります。よろしいですか？`,
      )
    ) {
      return;
    }
    start(async () => {
      setError(null);
      const res = await recordBatchResultsAction(
        id,
        rows.map((r) =>
          failed[r.itemId] !== undefined
            ? { itemId: r.itemId, result: "failed" as const, reason: failed[r.itemId] }
            : { itemId: r.itemId, result: "success" as const },
        ),
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage(`反映しました（引き落とし済 ${res.success}件 / 不可 ${res.failed}件）`);
      setFailed({});
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return message ? (
      <p className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
        <CheckCircle2 className="h-4 w-4" />
        {message}
      </p>
    ) : null;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        NSS の振替結果を見ながら、<span className="font-medium text-foreground">引き落とせなかったものだけ</span>
        「不可」にしてください。それ以外は「引き落とし済」として入金を記録します。
      </p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((r) => {
          const isFailed = failed[r.itemId] !== undefined;
          return (
            <li key={r.itemId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.customerName}</div>
                <div className="tabular text-xs text-muted-foreground">
                  {r.invoiceNumber}・{formatJPY(r.amount)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isFailed && (
                  <Select
                    className="h-9 w-44 text-xs md:h-8"
                    value={failed[r.itemId]}
                    onChange={(e) => setFailed((prev) => ({ ...prev, [r.itemId]: e.target.value }))}
                  >
                    {DEBIT_FAILURE_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </Select>
                )}
                <button
                  type="button"
                  onClick={() => toggle(r.itemId)}
                  className={cn(
                    "h-9 rounded-md border px-3 text-xs font-medium md:h-8",
                    isFailed
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-success/50 bg-success/10 text-success",
                  )}
                >
                  {isFailed ? "引き落とし不可" : "引き落とし済"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" onClick={submit} disabled={pending}>
        <CheckCircle2 className="h-4 w-4" />
        {pending ? "反映中…" : `結果を反映する（済 ${successCount} / 不可 ${failedCount}）`}
      </Button>
    </div>
  );
}
