import { CheckCircle2, X } from "lucide-react";
import Link from "next/link";
import { markNotificationsReadAction } from "@/app/actions/notifications";
import { getCurrentUser } from "@/lib/auth";
import { getServiceRepository } from "@/lib/data";

/**
 * 対応完了のお知らせバナー(トップ表示)。
 * 未読の「対応完了」通知があるあいだ、ダッシュボード / 開発進捗の最上部に表示する。
 */
export async function CompletionBanner() {
  const user = await getCurrentUser();
  if (!user.id) return null;
  const repo = await getServiceRepository();
  const unread = await repo.listNotifications(user.id, { unreadOnly: true, limit: 20 });
  const done = unread.filter((n) => n.type === "issue_done");
  if (done.length === 0) return null;

  const doneIds = done.map((n) => n.id);
  async function dismiss() {
    "use server";
    await markNotificationsReadAction(doneIds);
  }

  return (
    <div className="mb-6 rounded-lg border border-success/30 bg-success/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold text-success">
              対応完了のお知らせ（{done.length}件）
            </p>
            <ul className="mt-1.5 space-y-1">
              {done.slice(0, 5).map((n) => (
                <li key={n.id} className="text-sm">
                  {n.issueId ? (
                    <Link href={`/dev/${n.issueId}`} className="hover:underline">
                      {n.message}
                    </Link>
                  ) : (
                    n.message
                  )}
                </li>
              ))}
              {done.length > 5 && (
                <li className="text-xs text-muted-foreground">ほか {done.length - 5} 件</li>
              )}
            </ul>
          </div>
        </div>
        <form action={dismiss}>
          <button
            type="submit"
            aria-label="お知らせを閉じる(既読にする)"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-success/15 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
