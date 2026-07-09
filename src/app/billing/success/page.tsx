import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { LogoStacked } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

export const metadata = { title: "お支払い完了" };

export default function BillingSuccessPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-secondary via-background to-background p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <LogoStacked className="mb-6" />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/12 text-success">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">お支払いが完了しました</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          初期費用と月額のご登録ありがとうございます。次回以降は毎月自動で決済されます。
          <br />
          反映まで数秒かかる場合があります。
        </p>
        <Link href="/dashboard" className={buttonClasses({ className: "mt-6 w-full" })}>
          ダッシュボードへ
        </Link>
      </div>
    </div>
  );
}
