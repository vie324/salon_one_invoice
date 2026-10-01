"use client";

import { Check, Copy, Link2, Pause, Play, QrCode, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  deleteApplicationLinkAction,
  setApplicationLinkActiveAction,
} from "@/app/actions/applications";
import { QrCodeImage } from "@/components/share/share-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  applicationFormUrl,
  applicationLinkAvailability,
  applicationLinkKind,
  applicationLinkKindLabels,
  applicationLinkKindTone,
} from "@/lib/domain/application";
import { AGENCY_DEAL_TYPES } from "@/lib/domain/constants";
import type { ApplicationLink } from "@/lib/domain/types";
import type { LinkDetail } from "@/lib/orders/link-details";
import { formatDate } from "@/lib/utils";

/**
 * 申込・契約URLのコピー・QR・停止・削除。発行はページ上部の「申込・契約URLを発行」から。
 * baseUrl が未設定(NEXT_PUBLIC_APP_URL なし)の場合は表示中のオリジンを使う。
 */
export function ApplicationLinkManager({
  links,
  baseUrl,
  details,
  emptyText = "まだURLがありません。「申込・契約URLを発行」から作成してください。",
}: {
  links: ApplicationLink[];
  baseUrl: string;
  details: Record<string, LinkDetail>;
  emptyText?: string;
}) {
  const router = useRouter();
  const [origin, setOrigin] = React.useState(baseUrl);
  const [error, setError] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [qrLink, setQrLink] = React.useState<ApplicationLink | null>(null);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (!baseUrl) setOrigin(window.location.origin);
  }, [baseUrl]);

  const urlOf = (link: ApplicationLink) => applicationFormUrl(origin, link.token);

  async function copy(link: ApplicationLink) {
    const url = urlOf(link);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // クリップボードが使えない環境(権限拒否など)は選択用に表示する
      window.prompt("このURLをコピーしてお客様にお渡しください", url);
      return;
    }
    setCopiedId(link.id);
    window.setTimeout(() => setCopiedId(null), 2000);
  }

  function toggle(link: ApplicationLink) {
    start(async () => {
      const res = await setApplicationLinkActiveAction(link.id, !link.active);
      if (!res.ok) setError(res.error ?? "更新に失敗しました");
      router.refresh();
    });
  }

  function remove(link: ApplicationLink) {
    if (
      !window.confirm(
        `申込URL「${link.name}」を削除します。\nこのURLからは申込できなくなります（受付済みの申込は残ります）。`,
      )
    ) {
      return;
    }
    start(async () => {
      const res = await deleteApplicationLinkAction(link.id);
      if (!res.ok) setError(res.error ?? "削除に失敗しました");
      router.refresh();
    });
  }

  return (
    <Card className="p-4">
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {links.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => {
            const state = applicationLinkAvailability(link);
            const kind = applicationLinkKind(link);
            const detail = details[link.id];
            return (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2.5"
              >
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{link.name}</span>
                    <Badge tone={applicationLinkKindTone[kind]}>{applicationLinkKindLabels[kind]}</Badge>
                    {state === "ok" && <Badge tone="success">受付中</Badge>}
                    {state === "inactive" && <Badge tone="neutral">停止中</Badge>}
                    {state === "expired" && <Badge tone="danger">期限切れ</Badge>}
                    <span className="text-xs text-muted-foreground">
                      申込 {link.submissionCount}件
                    </span>
                  </div>
                  {detail && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        detail.planName,
                        detail.priceLabel,
                        detail.agencyName
                          ? `代理店: ${detail.agencyName}${detail.memberName ? `（${detail.memberName}）` : ""}${
                              link.agencyDealType ? `・${AGENCY_DEAL_TYPES[link.agencyDealType].label}` : ""
                            }`
                          : null,
                        detail.referralName ? `紹介: ${detail.referralName}` : null,
                        link.allowInquiry ? "相談の入口あり" : null,
                      ]
                        .filter(Boolean)
                        .join(" ／ ")}
                    </div>
                  )}
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{urlOf(link)}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {link.expiresAt ? `期限 ${formatDate(link.expiresAt)}` : "無期限"} ／ 発行者{" "}
                    {link.createdBy || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => copy(link)}>
                    {copiedId === link.id ? (
                      <>
                        <Check className="h-4 w-4" />
                        コピーしました
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        URLをコピー
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setQrLink(link)}
                    title="QRコードを表示（対面でお渡しする場合）"
                  >
                    <QrCode className="h-4 w-4" />
                    QR
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle(link)}
                    disabled={pending}
                    title={link.active ? "受付を停止する" : "受付を再開する"}
                  >
                    {link.active ? (
                      <>
                        <Pause className="h-4 w-4" />
                        停止
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        再開
                      </>
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(link)}
                    disabled={pending}
                    aria-label="削除"
                    title="削除"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={!!qrLink}
        onClose={() => setQrLink(null)}
        title={qrLink ? `QRコード（${qrLink.name}）` : "QRコード"}
        description="お客様のスマートフォンで読み取っていただくと、お申込みページが開きます。"
      >
        {qrLink && (
          <div className="flex flex-col items-center gap-3">
            <QrCodeImage value={urlOf(qrLink)} className="h-56 w-56" />
            <p className="break-all text-center text-xs text-muted-foreground">{urlOf(qrLink)}</p>
            <Button variant="outline" onClick={() => copy(qrLink)}>
              <Copy className="h-4 w-4" />
              URLをコピー
            </Button>
          </div>
        )}
      </Dialog>

    </Card>
  );
}
