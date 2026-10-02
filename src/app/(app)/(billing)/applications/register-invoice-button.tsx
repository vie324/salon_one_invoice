"use client";

import { FilePlus2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createCustomerFromApplicationAction } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";

/**
 * まだ顧客になっていない申込から「顧客登録 → 請求書の作成」をまとめて行うボタン。
 * 申込内容(会社名・連絡先・住所・代理店/紹介)のまま顧客を作り、その顧客を選んだ状態で
 * 請求書の作成画面を開く(区分は「初期費用」= 受注管理の初回請求書として扱われる)。
 */
export function RegisterAndInvoiceButton({
  applicationId,
  companyName,
  label = "顧客登録して請求書を作成",
  size = "sm",
  variant = "outline",
}: {
  applicationId: string;
  companyName: string;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "outline";
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const run = () => {
    if (
      !window.confirm(
        `「${companyName}」を申込内容のまま顧客として登録し、請求書の作成画面を開きます。よろしいですか？`,
      )
    ) {
      return;
    }
    setError(null);
    start(async () => {
      const res = await createCustomerFromApplicationAction(applicationId);
      if (!res.ok) {
        setError(res.error ?? "顧客登録に失敗しました");
        return;
      }
      router.push(`/invoices/new?customer=${res.customerId}&type=initial`);
    });
  };

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-start">
      <Button type="button" size={size} variant={variant} onClick={run} disabled={pending}>
        <FilePlus2 className="h-4 w-4" />
        {pending ? "登録中…" : label}
      </Button>
      {error && <p className="max-w-[16rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}
