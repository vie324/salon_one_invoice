"use client";

import { Check, Copy, Eye, EyeOff, KeyRound, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  createCustomerFromApplicationAction,
  revealApplicationCredentialsAction,
  updateApplicationStatusAction,
} from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { hasCredential } from "@/lib/domain/application";
import { APPLICATION_SERVICES, applicationStatusLabels } from "@/lib/domain/constants";
import type { Application, ApplicationStatus, ServiceCredential } from "@/lib/domain/types";

type Credentials = Record<"hotpepper" | "minimo" | "epark", ServiceCredential | null>;

/**
 * 連携情報の表示。
 * 既定はマスク表示で、「表示する」を押したときだけサーバー側で復号して取得する
 * (平文はページの HTML には含まれない)。
 */
export function CredentialsPanel({
  applicationId,
  application,
}: {
  applicationId: string;
  application: Application;
}) {
  const [revealed, setRevealed] = React.useState<Credentials | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const anyCredential = APPLICATION_SERVICES.some((s) => hasCredential(application[s.key]));

  function reveal() {
    setError(null);
    start(async () => {
      const res = await revealApplicationCredentialsAction(applicationId);
      if (!res.ok) {
        setError(res.error ?? "取得に失敗しました");
        return;
      }
      setRevealed(res.credentials as Credentials);
    });
  }

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("コピーしてください", value);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>外部サービス連携情報</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            お預かりしたID・パスワードは暗号化して保管しています。連携作業のときだけ表示してください。
          </p>
        </div>
        {anyCredential && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => (revealed ? setRevealed(null) : reveal())}
            disabled={pending}
          >
            {revealed ? (
              <>
                <EyeOff className="h-4 w-4" />
                隠す
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                {pending ? "取得中…" : "表示する"}
              </>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!anyCredential && (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            連携情報の入力はありませんでした。
          </p>
        )}
        {APPLICATION_SERVICES.map((s) => {
          const masked = application[s.key];
          if (!hasCredential(masked)) return null;
          const plain = revealed?.[s.key] ?? null;
          return (
            <div key={s.key} className="rounded-md border border-border p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                {s.label}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CredentialValue
                  label="ID"
                  masked={masked?.loginId ?? "—"}
                  plain={plain?.loginId}
                  copied={copied === `${s.key}-id`}
                  onCopy={(v) => copy(`${s.key}-id`, v)}
                />
                <CredentialValue
                  label="PASS"
                  masked={masked?.password ?? "—"}
                  plain={plain?.password}
                  copied={copied === `${s.key}-pw`}
                  onCopy={(v) => copy(`${s.key}-pw`, v)}
                />
              </div>
            </div>
          );
        })}
        <div className="rounded-md border border-border p-4">
          <div className="text-sm font-semibold">LINE連携申込</div>
          <div className="mt-1 text-sm">
            {application.lineRequested ? "申込あり" : "申込なし"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CredentialValue({
  label,
  masked,
  plain,
  copied,
  onCopy,
}: {
  label: string;
  masked: string;
  plain?: string;
  copied: boolean;
  onCopy: (value: string) => void;
}) {
  const shown = plain ?? masked;
  // 復号できない場合(鍵の変更など)は空文字が返る
  const undecryptable = plain === "";
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-sm">
          {undecryptable ? "復号できません" : shown}
        </code>
        {plain && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onCopy(plain)}
            aria-label={`${label}をコピー`}
            title="コピー"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

const STATUS_OPTIONS: ApplicationStatus[] = ["submitted", "customer_created", "archived"];

/** 顧客登録・対応状況の変更 */
export function ApplicationActions({
  applicationId,
  status,
  customerId,
}: {
  applicationId: string;
  status: ApplicationStatus;
  customerId: string | null;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function register() {
    setError(null);
    start(async () => {
      const res = await createCustomerFromApplicationAction(applicationId);
      if (!res.ok) {
        setError(res.error ?? "顧客登録に失敗しました");
        return;
      }
      router.push(`/customers/${res.customerId}`);
    });
  }

  function changeStatus(next: ApplicationStatus) {
    setError(null);
    start(async () => {
      const res = await updateApplicationStatusAction(applicationId, next);
      if (!res.ok) setError(res.error ?? "更新に失敗しました");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-40"
          value={status}
          onChange={(e) => changeStatus(e.target.value as ApplicationStatus)}
          disabled={pending}
          aria-label="対応状況"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {applicationStatusLabels[s]}
            </option>
          ))}
        </Select>
        {!customerId && (
          <Button onClick={register} disabled={pending}>
            <UserPlus className="h-4 w-4" />
            {pending ? "登録中…" : "顧客として登録"}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
