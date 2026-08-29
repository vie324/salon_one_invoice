import { ClipboardList } from "lucide-react";
import { getJobRepository } from "@/lib/data";
import { ApplyForm } from "./apply-form";

export const metadata = { title: "お申込みフォーム" };
export const dynamic = "force-dynamic";

/**
 * 公開申込フォーム(お客様向け・認証不要)。
 * アクセス制御は暗号乱数トークン + 受付停止 + 有効期限で行う。
 * 認証ゲートを通らない経路のため getJobRepository を使用する。
 */
export default async function ApplyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const repo = await getJobRepository();
  const { link, state } = await repo.getApplicationLinkByToken(token);

  if (!link || state === "not_found") {
    return (
      <Shell>
        <Notice
          title="URLが無効です"
          body="このお申込みURLは存在しないか、削除されています。お手数ですが送信元にお問い合わせください。"
        />
      </Shell>
    );
  }

  const org = await repo.getOrganization();

  if (state === "inactive") {
    return (
      <Shell orgName={org.name}>
        <Notice
          title="現在お申込みを受け付けていません"
          body="このお申込みURLは受付を停止しています。お手数ですが送信元にお問い合わせください。"
        />
      </Shell>
    );
  }

  if (state === "expired") {
    return (
      <Shell orgName={org.name}>
        <Notice
          title="お申込みの期限が過ぎています"
          body="このお申込みURLの有効期限が切れています。送信元に再発行をご依頼ください。"
        />
      </Shell>
    );
  }

  return (
    <Shell orgName={org.name}>
      <ApplyForm token={token} orgName={org.name} />
    </Shell>
  );
}

function Shell({ children, orgName }: { children: React.ReactNode; orgName?: string }) {
  return (
    <div className="min-h-screen bg-neutral-100 py-5 dark:bg-background sm:py-8">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <ClipboardList className="h-4 w-4" />
          お申込みフォーム{orgName ? ` — ${orgName}` : ""}
        </div>
        {children}
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center shadow-sm sm:p-8">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
