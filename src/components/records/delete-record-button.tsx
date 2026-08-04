"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { restoreRecordAction, softDeleteRecordAction } from "@/app/actions/records";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import type { DeletableEntity } from "@/lib/domain/types";

const ENTITY_LABELS: Record<DeletableEntity, string> = {
  invoice: "請求書",
  customer: "顧客",
  payment: "入金",
  subscription: "定期契約",
  bank_transaction: "銀行明細",
  batch: "口座振替バッチ",
};

/**
 * 削除(ゴミ箱へ移動)ボタン。
 * データは消さず一覧から外すだけなので、設定 → ゴミ箱からいつでも戻せる。
 * 何のために消したかを残すため、理由を入力してもらう。
 */
export function DeleteRecordButton({
  entity,
  id,
  label,
  redirectTo,
  size = "sm",
  className,
}: {
  entity: DeletableEntity;
  id: string;
  /** 確認ダイアログに出す対象名(請求書番号・顧客名など) */
  label: string;
  /** 削除後の遷移先(詳細画面から消した場合の戻り先) */
  redirectTo?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await softDeleteRecordAction(entity, id, reason);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={size}
        className={className ?? "text-muted-foreground hover:text-destructive"}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        削除
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${ENTITY_LABELS[entity]}を削除しますか？`}
        description="データは消えません。一覧・集計から外れるだけで、ゴミ箱からいつでも復元できます。"
      >
        <div className="space-y-4">
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            対象: <span className="font-medium">{label}</span>
          </p>
          <Field label="削除の理由" hint="例）テストで登録したデータのため">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="テストデータの整理"
              autoFocus
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button type="button" variant="danger" onClick={submit} disabled={pending}>
              <Trash2 className="h-4 w-4" />
              {pending ? "削除中…" : "削除する"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** ゴミ箱からの復元ボタン */
export function RestoreRecordButton({
  entity,
  id,
}: {
  entity: DeletableEntity;
  id: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const restore = () =>
    start(async () => {
      setError(null);
      const res = await restoreRecordAction(entity, id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });

  return (
    <div className="text-right">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={restore}>
        <RotateCcw className="h-4 w-4" />
        {pending ? "復元中…" : "復元"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export { ENTITY_LABELS };
