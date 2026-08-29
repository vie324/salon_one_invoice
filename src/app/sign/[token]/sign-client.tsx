"use client";

import { CheckCircle2, KeyRound, ShieldCheck, XCircle } from "lucide-react";
import * as React from "react";
import {
  declineContractAction,
  loadContractForSigningAction,
  recordContractViewAction,
  signContractAction,
} from "@/app/actions/contracts";
import { ContractDocument } from "@/components/contracts/contract-document";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { Contract } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/utils";

/**
 * 署名フロー(契約者側)。
 * 1) アクセスコード検証(設定時のみ) → 2) 内容確認 → 3) 同意(電子署名) or 辞退
 * 署名時には氏名の記入と同意チェックを必須とし、操作の証跡はサーバー側で記録される。
 */
export function SignClient({
  token,
  requiresCode,
  orgName,
  contractNumber,
  contractTitle,
  expiresAt,
  initialContract,
  defaultSignerName,
}: {
  token: string;
  requiresCode: boolean;
  orgName: string;
  contractNumber: string;
  contractTitle: string;
  expiresAt: string | null;
  initialContract: Contract | null;
  defaultSignerName: string;
}) {
  const [contract, setContract] = React.useState<Contract | null>(initialContract);
  const [code, setCode] = React.useState("");
  const [verifiedCode, setVerifiedCode] = React.useState<string | undefined>(undefined);
  const [signerName, setSignerName] = React.useState(defaultSignerName);
  const [agreed, setAgreed] = React.useState(false);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [declineReason, setDeclineReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState(false);
  const [pending, start] = React.useTransition();

  // 閲覧の証跡記録(実ブラウザ表示後に一度だけ。コード必須時は検証時に記録される)
  const viewedRef = React.useRef(false);
  React.useEffect(() => {
    if (!requiresCode && !viewedRef.current) {
      viewedRef.current = true;
      void recordContractViewAction(token);
    }
  }, [requiresCode, token]);

  const verify = () =>
    start(async () => {
      setError(null);
      const res = await loadContractForSigningAction(token, code.trim());
      if (res.ok) {
        setContract(res.contract);
        setVerifiedCode(code.trim());
      } else {
        setError(res.error ?? "アクセスコードが一致しません");
        if (res.locked) setLocked(true);
      }
    });

  const sign = () =>
    start(async () => {
      setError(null);
      const res = await signContractAction(token, {
        signerName,
        accessCode: verifiedCode,
      });
      if (res.ok) {
        // サーバー側で締結済みビュー(証明書付き)を表示する
        window.location.reload();
      } else {
        setError(res.error ?? "署名に失敗しました");
      }
    });

  const decline = () =>
    start(async () => {
      setError(null);
      const res = await declineContractAction(token, {
        reason: declineReason.trim() || "辞退",
        accessCode: verifiedCode,
      });
      if (res.ok) window.location.reload();
      else setError(res.error ?? "処理に失敗しました");
    });

  /* ---- アクセスコード入力ゲート ---- */
  if (!contract) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-5 shadow-sm sm:p-8">
        <div className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-5 w-5 text-primary" />
          アクセスコードの入力
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          「{contractTitle}」（{contractNumber}）の閲覧にはアクセスコードが必要です。
          {orgName} の担当者からお電話等でお伝えしたコード(6桁)を入力してください。
        </p>
        <div className="mt-4 space-y-3">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="text-center text-lg tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            disabled={locked || pending}
          />
          <Button
            className="w-full"
            onClick={verify}
            disabled={locked || pending || code.length !== 6}
          >
            確認して契約内容を表示
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {locked && (
            <p className="text-xs text-muted-foreground">
              セキュリティのためロックされました。送信元に再送をご依頼ください。
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ---- 内容確認 + 署名 ---- */
  return (
    <div className="space-y-6">
      <div className="no-print rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          契約内容をご確認のうえ、ページ下部でご署名ください
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          契約書番号 {contractNumber}
          {expiresAt ? ` ・ 署名期限 ${formatDateTime(expiresAt)}` : ""}。
          ご署名の際は、同意日時・IPアドレス・端末情報が締結の証跡として記録されます。
        </p>
      </div>

      <ContractDocument contract={contract} />

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
        <h2 className="font-semibold">電子署名（同意）</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          下記に署名者ご本人の氏名をご入力のうえ、同意にチェックして「同意して締結する」を押してください。
          これをもって書面への記名押印に代わる電子署名となります。
        </p>

        <div className="mt-4 space-y-4">
          <Field label="署名者氏名（本人の氏名を正確にご入力ください）">
            <Input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="例）山田 花子"
              autoComplete="name"
              disabled={pending}
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-muted/40 p-4 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={pending}
            />
            <span>
              本契約書の内容をすべて確認し、同意します。また、本契約が電磁的記録により締結されること、
              および締結の証跡(同意日時・IPアドレス・端末情報等)が記録されることに同意します。
            </span>
          </label>

          <Button
            className="w-full"
            size="lg"
            onClick={sign}
            disabled={pending || !agreed || !signerName.trim()}
          >
            <CheckCircle2 className="h-4 w-4" />
            同意して締結する
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {!declineOpen ? (
            <button
              type="button"
              className="mx-auto block text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setDeclineOpen(true)}
              disabled={pending}
            >
              締結を辞退する
            </button>
          ) : (
            <div className="rounded-md border border-border p-4">
              <Field label="辞退の理由（任意）">
                <Textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="例）内容について再度相談したい"
                  disabled={pending}
                />
              </Field>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeclineOpen(false)} disabled={pending}>
                  戻る
                </Button>
                <Button variant="danger" size="sm" onClick={decline} disabled={pending}>
                  <XCircle className="h-4 w-4" />
                  辞退を確定する
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
