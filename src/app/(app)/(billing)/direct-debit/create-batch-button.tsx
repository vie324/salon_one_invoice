"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createBatchAction } from "@/app/actions/direct-debit";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { toISODate } from "@/lib/utils";

export function CreateBatchButton({ awaitingCount }: { awaitingCount: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const now = new Date();
  const defaultDate = toISODate(new Date(now.getFullYear(), now.getMonth(), 27));
  const [date, setDate] = React.useState(defaultDate);

  const submit = () =>
    start(async () => {
      const res = await createBatchAction(date);
      if (res.ok) {
        setOpen(false);
        if (res.id) router.push(`/direct-debit/${res.id}`);
        else router.refresh();
      } else setError(res.error ?? "作成に失敗しました。");
    });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        振替バッチを作成
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="口座振替バッチの作成"
        description={`入金待ちの口座振替請求（${awaitingCount}件）をまとめて1つのバッチにします。`}
      >
        <div className="space-y-4">
          <Field label="引き落とし予定日" hint="収納代行サービスの締めに合わせて設定します。">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={submit} disabled={pending || awaitingCount === 0}>
              バッチを作成
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
