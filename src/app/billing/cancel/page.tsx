import { XCircle } from "lucide-react";
import Link from "next/link";
import { LogoStacked } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";

export const metadata = { title: "お支払いをキャンセル" };

export default function BillingCancelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-secondary via-background to-background p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <LogoStacked className="mb-6" />
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <XCircle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">お支払いはキャンセルされました</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          手続きは完了していません。もう一度お試しいただけます。
        </p>
        <Link href="/dashboard" className={buttonClasses({ variant: "outline", className: "mt-6 w-full" })}>
          戻る
        </Link>
      </div>
    </div>
  );
}
