"use client";

import { Check, Copy, Link2, Plus, Power, Trash2 } from "lucide-react";
import * as React from "react";
import {
  createReferralLinkAction,
  deleteReferralLinkAction,
  setReferralLinkActiveAction,
} from "@/app/actions/referrals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { referralLinkUrl } from "@/lib/domain/referral";
import type { ReferralLink } from "@/lib/domain/types";
import { copyText } from "@/lib/share";
import { formatDate } from "@/lib/utils";

/**
 * 紹介フォームURLの管理。
 * 基本はいちばん上の「常設URL」をそのまま配る。
 * 紹介者ごとに配りたいときだけ、紹介者を指定したURLを発行する。
 */
export function ReferralLinkManager({
  links,
  baseUrl,
  formUrl,
  customers,
}: {
  links: ReferralLink[];
  baseUrl: string;
  /** 常設フォームの絶対URL */
  formUrl: string;
  customers: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [referrerCustomerId, setReferrerCustomerId] = React.useState("");
  const [error, setError] = React.useState("");
  const [pending, start] = React.useTransition();

  const create = () => {
    setError("");
    start(async () => {
      const res = await createReferralLinkAction({
        name,
        referrerCustomerId: referrerCustomerId || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setName("");
      setReferrerCustomerId("");
    });
  };

  return (
    <Card className="p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">紹介フォームのURL</h2>
        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          紹介者を指定したURLを発行
        </Button>
      </div>

      {/* 常設URL — これがお客様へ配る基本のURL */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">常設URL</Badge>
          <span className="text-xs text-muted-foreground">
            誰でも開けます。「どなたのご紹介か」はフォームで入力してもらいます。
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-card px-2.5 py-2 text-xs">
            {formUrl || "/refer"}
          </code>
          <CopyButton value={formUrl} label="URLをコピー" />
        </div>
      </div>

      {links.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">紹介者を指定したURL</p>
          {links.map((link) => (
            <LinkRow key={link.id} link={link} baseUrl={baseUrl} pending={pending} />
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="紹介者を指定したURLを発行"
        description="このURLから届いたお申込みは、指定した紹介者のご紹介として自動で記録されます。"
      >
        <div className="space-y-4">
          <Field label="URLの名前（宛先メモ）" hint="管理画面での識別用です。お客様には表示されません。">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例）サロン〇〇様 紹介用"
              autoFocus
            />
          </Field>
          <Field
            label="ご紹介者（顧客）"
            hint="選ぶと、フォームの「どなたのご紹介ですか？」が埋まった状態で開きます。"
          >
            <Select
              value={referrerCustomerId}
              onChange={(e) => setReferrerCustomerId(e.target.value)}
            >
              <option value="">指定しない（フォームで入力してもらう）</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={create} disabled={pending || !name.trim()}>
              発行する
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

function LinkRow({
  link,
  baseUrl,
  pending,
}: {
  link: ReferralLink;
  baseUrl: string;
  pending: boolean;
}) {
  const [busy, start] = React.useTransition();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const url = referralLinkUrl(baseUrl, link.token);
  const disabled = pending || busy;

  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{link.name}</span>
        {link.referrerName && <Badge tone="info">紹介者: {link.referrerName}</Badge>}
        <Badge tone={link.active ? "success" : "neutral"}>
          {link.active ? "受付中" : "停止中"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {link.submissionCount}件
          {link.expiresAt ? ` / 期限 ${formatDate(link.expiresAt)}` : ""}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 text-xs">
          {url}
        </code>
        <CopyButton value={url} label="コピー" />
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() =>
            start(async () => {
              await setReferralLinkActiveAction(link.id, !link.active);
            })
          }
        >
          <Power className="h-3.5 w-3.5" />
          {link.active ? "停止" : "再開"}
        </Button>
        {confirmDelete ? (
          <>
            <Button
              variant="danger"
              size="sm"
              disabled={disabled}
              onClick={() =>
                start(async () => {
                  await deleteReferralLinkAction(link.id);
                })
              }
            >
              削除する
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              やめる
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={disabled}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await copyText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "コピーしました" : label}
    </Button>
  );
}
