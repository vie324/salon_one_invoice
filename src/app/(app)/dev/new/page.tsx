import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { NewIssueForm } from "./new-issue-form";

export const metadata = { title: "新規開発依頼" };

export const dynamic = "force-dynamic";

export default async function NewDevIssuePage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="新規依頼"
        description="不具合の報告・機能の要望を登録します。"
        actions={
          <Link
            href="/dev"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            一覧へ戻る
          </Link>
        }
      />
      <Card>
        <CardContent className="pt-6">
          <div className="mb-5 rounded-md bg-secondary px-3 py-2.5 text-xs text-secondary-foreground">
            記載日(<span className="font-medium">{formatDate(new Date())}</span>)と依頼者(
            <span className="font-medium">{user.name}</span>
            )は、ログイン中のアカウントから自動で記録されます。
          </div>
          <NewIssueForm />
        </CardContent>
      </Card>
    </div>
  );
}
