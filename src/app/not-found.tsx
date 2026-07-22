import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <SearchX className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="mt-4 text-lg font-bold">ページが見つかりません</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          URLが誤っているか、対象のデータが削除・取消されている可能性があります。
        </p>
        <div className="mt-5">
          <Link href="/dashboard" className={buttonClasses()}>
            ダッシュボードへ戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
