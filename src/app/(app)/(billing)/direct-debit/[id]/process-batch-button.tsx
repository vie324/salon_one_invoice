"use client";

import { PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { processBatchAction } from "@/app/actions/direct-debit";
import { Button } from "@/components/ui/button";

export function ProcessBatchButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [flash, setFlash] = React.useState<string | null>(null);

  const run = () =>
    start(async () => {
      const res = await processBatchAction(id);
      setFlash(
        res.ok
          ? `処理完了：成功 ${res.success}件 / 失敗 ${res.failed}件`
          : res.error ?? "処理に失敗しました。",
      );
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <Button onClick={run} disabled={pending || disabled} className="w-full">
        <PlayCircle className="h-4 w-4" />
        引き落としを処理
      </Button>
      {flash && (
        <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">{flash}</p>
      )}
      <p className="text-xs text-muted-foreground">
        処理すると、成功分は入金確認済みとなり、失敗分は「引落失敗」として要フォローに表示されます。
      </p>
    </div>
  );
}
