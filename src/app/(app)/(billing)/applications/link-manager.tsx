"use client";

import { Check, Copy, Link2, Pause, Play, Plus, QrCode, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  createApplicationLinkAction,
  deleteApplicationLinkAction,
  setApplicationLinkActiveAction,
} from "@/app/actions/applications";
import { QrCodeImage } from "@/components/share/share-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import {
  applicationFormUrl,
  applicationLinkAvailability,
} from "@/lib/domain/application";
import { APPLICATION_LINK_EXPIRY_DAYS } from "@/lib/domain/constants";
import type { ApplicationLink } from "@/lib/domain/types";
import { formatDate } from "@/lib/utils";

const EXPIRY_OPTIONS = [
  { value: 7, label: "7日間" },
  { value: 14, label: "14日間" },
  { value: APPLICATION_LINK_EXPIRY_DAYS, label: `${APPLICATION_LINK_EXPIRY_DAYS}日間（既定）` },
  { value: 90, label: "90日間" },
  { value: 0, label: "無期限" },
];

/**
 * 申込URLの発行・コピー・停止・削除。
 * baseUrl が未設定(NEXT_PUBLIC_APP_URL なし)の場合は表示中のオリジンを使う。
 */
export function ApplicationLinkManager({
  links,
  baseUrl,
}: {
  links: ApplicationLink[];
  baseUrl: string;
}) {
  const router = useRouter();
  const [origin, setOrigin] = React.useState(baseUrl);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [expiryDays, setExpiryDays] = React.useState(APPLICATION_LINK_EXPIRY_DAYS);
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

  function create() {
    setError(null);
    start(async () => {
      const res = await createApplicationLinkAction({ name, expiryDays });
      if (!res.ok) {
        setError(res.error ?? "発行に失敗しました");
        return;
      }
      setOpen(false);
      setName("");
      setExpiryDays(APPLICATION_LINK_EXPIRY_DAYS);
      router.refresh();
    });
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">申込URL</h2>
          <p className="text-xs text-muted-foreground">
            発行したURLをお客様にお渡しすると、入力内容がそのままこのツールに反映されます。
            メールは不要です（コピーしてLINE・SMS、または「QR」で対面でもお渡しできます）。
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          申込URLを発行
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {links.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          まだ申込URLがありません。「申込URLを発行」から作成してください。
        </div>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => {
            const state = applicationLinkAvailability(link);
            return (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2.5"
              >
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{link.name}</span>
                    {state === "ok" && <Badge tone="success">受付中</Badge>}
                    {state === "inactive" && <Badge tone="neutral">停止中</Badge>}
                    {state === "expired" && <Badge tone="danger">期限切れ</Badge>}
                    <span className="text-xs text-muted-foreground">
                      申込 {link.submissionCount}件
                    </span>
                  </div>
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
        description="お客様のスマートフォンで読み取っていただくと、申込フォームが開きます。"
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

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="申込URLを発行"
        description="お客様ごと・案内ごとにURLを分けておくと、どこからの申込か分かります。"
      >
        <div className="space-y-4">
          <Field label="名前（宛先メモ）" hint="例: ○○サロン様 / 2026年8月 新規案内">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="○○サロン様"
              autoFocus
            />
          </Field>
          <Field label="有効期限" hint="期限を過ぎたURLからは申込できなくなります。">
            <Select
              value={String(expiryDays)}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
            >
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={create} disabled={pending || !name.trim()}>
              {pending ? "発行中…" : "発行する"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
