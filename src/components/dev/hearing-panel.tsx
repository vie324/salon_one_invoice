"use client";

import { BellRing, MessageSquare, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { addDevIssueReplyAction } from "@/app/actions/dev-issues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { devIssueReplyRoleLabels, devIssueReplyRoleTone } from "@/lib/domain/constants";
import type { DevIssueReply, DevIssueStatus } from "@/lib/domain/types";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * 追加ヒアリングのやり取り(詳細ページ)。
 *
 * エンジニアが「追加ヒアリング」で投げた確認事項に対し、依頼者がここへ返信を追記する。
 * 返信すると相手側(依頼者→エンジニア / エンジニア→依頼者)へ通知が飛び、
 * 誰へ共有できたかを各返信のバッジで確認できる。
 */
export function HearingPanel({
  issueId,
  status,
  devNote,
  replies,
  currentUserId,
  /** ログイン中のアカウントがエンジニアか(文言の出し分けに使う) */
  isEngineer,
}: {
  issueId: string;
  status: DevIssueStatus;
  devNote: string;
  replies: DevIssueReply[];
  currentUserId: string;
  isEngineer: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notified, setNotified] = React.useState<string[] | null>(null);
  const [pending, startTransition] = React.useTransition();

  const hearing = status === "hearing";
  const last = replies.length > 0 ? replies[replies.length - 1] : null;
  // ヒアリング中で、最後の発言がエンジニア側(または返信なし) = 依頼者が答える番
  const awaitingReply = hearing && last?.authorRole !== "requester";
  const answered = hearing && last?.authorRole === "requester";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotified(null);
    startTransition(async () => {
      const res = await addDevIssueReplyAction(issueId, body);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      setNotified(res.notifiedNames);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-2">
        <MessageSquare className="h-4 w-4 text-info" />
        <CardTitle>追加ヒアリングのやり取り</CardTitle>
        {answered && <Badge tone="info">返信あり</Badge>}
        {awaitingReply && <Badge tone="warning">返信待ち</Badge>}
        {replies.length > 0 && (
          <span className="text-xs text-muted-foreground">{replies.length}件</span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* いま誰の番かを最初に示す */}
        {awaitingReply && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs">
            {isEngineer
              ? "依頼者の返信待ちです。確認事項は「開発対応内容」に記載されています。"
              : "エンジニアから確認事項が届いています。下の欄に返信を追記してください。返信するとエンジニアへ通知されます。"}
          </p>
        )}
        {answered && (
          <p className="rounded-md border border-info/40 bg-info/10 px-3 py-2.5 text-xs">
            {isEngineer
              ? "依頼者から返信が届いています。内容を確認して、ステータスを「対応中」に戻してください。"
              : "返信はエンジニアへ共有済みです。確認され次第、ステータスが「対応中」に戻ります。"}
          </p>
        )}

        {/* エンジニアの確認事項(開発対応内容の写し。何に答えるのかが分かるように) */}
        {hearing && devNote && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground">
              エンジニアからの確認事項（開発対応内容）
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{devNote}</p>
          </div>
        )}

        {replies.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだ返信はありません。</p>
        ) : (
          <ul className="space-y-3">
            {replies.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-md border px-3 py-2.5",
                  r.authorRole === "engineer"
                    ? "border-primary/25 bg-primary/[0.04]"
                    : "border-info/25 bg-info/[0.05]",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={devIssueReplyRoleTone[r.authorRole]}>
                    {devIssueReplyRoleLabels[r.authorRole]}
                  </Badge>
                  <span className="text-sm font-medium">
                    {r.authorName}
                    {r.authorId === currentUserId && (
                      <span className="ml-1 text-xs text-muted-foreground">(自分)</span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDateTime(r.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
                <NotifiedBadge names={r.notifiedNames} role={r.authorRole} />
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} className="space-y-2 border-t border-border pt-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder={
              isEngineer
                ? "依頼者へ確認したいことを追記してください"
                : "確認事項への回答を追記してください"
            }
            aria-label="返信を追記"
          />
          <p className="text-xs text-muted-foreground">
            {isEngineer
              ? "追記すると依頼者へ通知が届きます。"
              : "追記するとエンジニアへ通知が届き、開発進捗の一覧にも「ヒアリング返信あり」と表示されます。"}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notified && !error && (
            <p className="text-sm text-success">
              {notified.length > 0
                ? `返信を追記し、${notified.join("・")} へ通知しました。`
                : "返信を追記しました。（通知先のアカウントがいないため、通知は送られていません）"}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending || !body.trim()}>
            <Send className="h-4 w-4" />
            {pending ? "送信中…" : "返信を追記して共有"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** その返信が誰へ通知されたかを示すバッジ(共有できたことを一目で分かるようにする) */
function NotifiedBadge({
  names,
  role,
}: {
  names: string[];
  role: DevIssueReply["authorRole"];
}) {
  if (names.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-muted-foreground">
        通知先のアカウントがいないため、通知は送られていません。
      </p>
    );
  }
  // 依頼者の返信はエンジニア全員へ、エンジニアの返信は依頼者(と他のエンジニア)へ届く
  const target = role === "requester" ? "エンジニア" : "関係者";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Badge tone="success">
        <BellRing className="h-3 w-3" />
        {target}へ通知済み
      </Badge>
      <span className="text-[11px] text-muted-foreground">{names.join("・")}</span>
    </div>
  );
}
