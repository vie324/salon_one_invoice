"use client";

import {
  Ban,
  ExternalLink,
  Link2,
  Mail,
  PenLine,
  Printer,
  Rocket,
  Send,
  Stamp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  cancelContractAction,
  markContractSignedManuallyAction,
  remindContractAction,
  sendContractAction,
  startContractBillingAction,
} from "@/app/actions/contracts";
import { ShareLink } from "@/components/share/share-link";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { CONTRACT_SIGN_EXPIRY_DAYS } from "@/lib/domain/constants";
import type { ContractDeliveryMethod } from "@/lib/domain/types";
import { cn, toISODate } from "@/lib/utils";

/** 契約書詳細の操作パネル(送付・リマインド・取消・手動締結・請求開始)。 */
export function ContractActions({
  id,
  status,
  defaultEmail,
  signerEmail,
  signToken,
  accessCode,
  hasPlan,
  hasInitialFee,
  billingLinked,
  defaultSignerName,
  defaultStartDate,
  emailReady,
}: {
  id: string;
  status: string;
  defaultEmail: string;
  /** 送付済みの契約に記録された宛先(リンク発行のみの場合は空) */
  signerEmail: string;
  signToken: string | null;
  accessCode: string | null;
  hasPlan: boolean;
  hasInitialFee: boolean;
  billingLinked: boolean;
  defaultSignerName: string;
  defaultStartDate: string | null;
  /** メールの実送信が設定済みか。未設定ならリンク発行を既定にする。 */
  emailReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [flash, setFlash] = React.useState<string | null>(null);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [billingOpen, setBillingOpen] = React.useState(false);
  const [issuedCode, setIssuedCode] = React.useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; emailResult?: string | null; detail?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setFlash(res.error ?? "処理に失敗しました");
      else if (res.emailResult) setFlash(res.emailResult);
      else if (res.detail) setFlash(res.detail);
      router.refresh();
    });

  const isDraft = status === "draft";
  const isAwaiting = status === "sent" || status === "viewed";
  const isExpired = status === "expired";
  const isSigned = status === "signed";
  const canCancel = isDraft || isAwaiting || isExpired;

  // window はマウント後にのみ参照(SSRとのhydration不一致を避ける)
  const [origin, setOrigin] = React.useState<string | null>(null);
  React.useEffect(() => setOrigin(window.location.origin), []);
  const signUrl = signToken && origin ? `${origin}/sign/${signToken}` : null;

  return (
    <div className="space-y-2">
      {isDraft && (
        <>
          <Link href={`/contracts/${id}/edit`} className={buttonClasses({ variant: "outline", className: "w-full" })}>
            <PenLine className="h-4 w-4" />
            内容を編集
          </Link>
          <Button className="w-full" disabled={pending} onClick={() => setSendOpen(true)}>
            {emailReady ? <Send className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
            {emailReady ? "署名依頼を送付" : "署名リンクを発行"}
          </Button>
        </>
      )}

      {(isAwaiting || isExpired) && (
        <>
          {isAwaiting && signerEmail && (
            <Button
              className="w-full"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => remindContractAction(id))}
            >
              <Mail className="h-4 w-4" />
              リマインドを送信
            </Button>
          )}
          <Button className="w-full" variant="outline" disabled={pending} onClick={() => setSendOpen(true)}>
            <Send className="h-4 w-4" />
            {emailReady ? "再送信（リンク再発行）" : "リンクを再発行"}
          </Button>
          {signUrl && (
            <ShareLink
              url={signUrl}
              label="署名リンク"
              hint={
                accessCode ? (
                  <>
                    <span className="font-medium text-foreground">アクセスコード: </span>
                    <span className="tabular tracking-widest text-foreground">{accessCode}</span>
                    <p className="mt-1">
                      リンクとは別経路（お電話等）でお伝えください（2要素の本人確認）。
                    </p>
                  </>
                ) : (
                  "LINE・SMS・対面（QRコード）など、お客様に届く方法でお渡しください。"
                )
              }
            />
          )}
        </>
      )}

      {isSigned && !billingLinked && (hasPlan || hasInitialFee) && (
        <Button className="w-full" disabled={pending} onClick={() => setBillingOpen(true)}>
          <Rocket className="h-4 w-4" />
          請求を開始（定期契約・初期費用）
        </Button>
      )}

      <a
        href={`/print/contracts/${id}`}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClasses({ variant: "outline", className: "w-full" })}
      >
        <Printer className="h-4 w-4" />
        印刷 / PDF{isSigned ? "（締結証明書付き）" : ""}
      </a>

      {isSigned && signUrl && (
        <a
          href={signUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ variant: "ghost", size: "sm", className: "w-full text-muted-foreground" })}
        >
          <ExternalLink className="h-4 w-4" />
          契約者向け表示を確認
        </a>
      )}

      {(isDraft || isAwaiting || isExpired) && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          disabled={pending}
          onClick={() => setManualOpen(true)}
        >
          <Stamp className="h-4 w-4" />
          書面締結を登録（紙で締結した場合）
        </Button>
      )}

      {canCancel && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          disabled={pending}
          onClick={() => setCancelOpen(true)}
        >
          <Ban className="h-4 w-4" />
          取消・無効化
        </Button>
      )}

      {flash && (
        <p className="rounded-md bg-secondary px-3 py-2 text-xs text-secondary-foreground">{flash}</p>
      )}
      {issuedCode && (
        <div className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
          <div className="font-semibold">アクセスコード: <span className="tabular tracking-widest">{issuedCode}</span></div>
          <p className="mt-1 text-muted-foreground">
            契約者へお電話等の別経路でお伝えください。メール・署名リンクには記載されていません。
          </p>
        </div>
      )}

      <SendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        defaultEmail={defaultEmail}
        pending={pending}
        isResend={!isDraft}
        emailReady={emailReady}
        onSubmit={(input) =>
          run(async () => {
            const res = await sendContractAction(id, input);
            if (res.ok) {
              setSendOpen(false);
              setIssuedCode(res.accessCode ?? null);
            }
            return res;
          })
        }
      />

      <ManualSignDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        defaultSignerName={defaultSignerName}
        pending={pending}
        onSubmit={(input) =>
          run(async () => {
            const res = await markContractSignedManuallyAction(id, input);
            if (res.ok) setManualOpen(false);
            return res;
          })
        }
      />

      <CancelDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        pending={pending}
        onSubmit={(reason) =>
          run(async () => {
            const res = await cancelContractAction(id, reason);
            if (res.ok) setCancelOpen(false);
            return res;
          })
        }
      />

      <BillingDialog
        open={billingOpen}
        onClose={() => setBillingOpen(false)}
        hasPlan={hasPlan}
        hasInitialFee={hasInitialFee}
        defaultStartDate={defaultStartDate}
        pending={pending}
        onSubmit={(startedOn) =>
          run(async () => {
            const res = await startContractBillingAction(id, { startedOn });
            if (res.ok) setBillingOpen(false);
            return res;
          })
        }
      />
    </div>
  );
}

function SendDialog({
  open,
  onClose,
  defaultEmail,
  onSubmit,
  pending,
  isResend,
  emailReady,
}: {
  open: boolean;
  onClose: () => void;
  defaultEmail: string;
  onSubmit: (input: {
    email: string;
    requireCode: boolean;
    expiresInDays: number;
    deliveryMethod: ContractDeliveryMethod;
  }) => void;
  pending: boolean;
  isResend: boolean;
  emailReady: boolean;
}) {
  const [email, setEmail] = React.useState(defaultEmail);
  const [requireCode, setRequireCode] = React.useState(true);
  const [days, setDays] = React.useState(CONTRACT_SIGN_EXPIRY_DAYS);
  // メール送信が未設定の環境では「リンクを発行して自分で渡す」を既定にする
  const [method, setMethod] = React.useState<ContractDeliveryMethod>(
    emailReady ? "email" : "link",
  );
  const isLink = method === "link";

  React.useEffect(() => {
    if (open) {
      setEmail(defaultEmail);
      setMethod(emailReady ? "email" : "link");
    }
  }, [open, defaultEmail, emailReady]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isResend ? "署名依頼の再発行" : "署名依頼"}
      description="契約内容はSHA-256ハッシュで固定化され、以降は変更できなくなります。"
    >
      <div className="space-y-4">
        <Field label="渡し方">
          <div className="grid gap-2">
            <MethodOption
              checked={method === "email"}
              onSelect={() => setMethod("email")}
              title="メールで送る"
              description={
                emailReady
                  ? "契約者のメールアドレスへ署名リンクを送信します。"
                  : "現在メール送信は未設定のため、実際には届きません（設定 → メール送信）。"
              }
              warn={!emailReady}
            />
            <MethodOption
              checked={isLink}
              onSelect={() => setMethod("link")}
              title="リンクを発行して自分で渡す（メールを送りません）"
              description="発行後にURLとQRコードを表示します。LINE・SMS・対面など、お客様に届く方法でお渡しください。"
            />
          </div>
        </Field>
        <Field
          label={isLink ? "契約者のメールアドレス（任意）" : "送付先メールアドレス"}
          hint={
            isLink
              ? "空欄でも発行できます。入力すると締結完了のお知らせ先として記録されます。"
              : "契約者本人のメールアドレス(本人確認の1要素になります)"
          }
        >
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="署名期限">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">日間有効</span>
          </div>
        </Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
            checked={requireCode}
            onChange={(e) => setRequireCode(e.target.checked)}
          />
          <span>
            <span className="font-medium">アクセスコードで保護する（推奨）</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              6桁のコードを発行します。{isLink ? "リンク" : "メール"}とは別の経路(電話等)で契約者へ伝えることで、
              2要素の本人確認となり電子署名の証拠力を高めます。
            </span>
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                email: email.trim(),
                requireCode,
                expiresInDays: days,
                deliveryMethod: method,
              })
            }
            disabled={pending || (!isLink && !email.trim())}
          >
            {isLink ? <Link2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {isLink ? (isResend ? "リンクを再発行する" : "リンクを発行する") : isResend ? "再送信する" : "送付する"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** 渡し方の選択肢(ラジオ)。 */
function MethodOption({
  checked,
  onSelect,
  title,
  description,
  warn,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  warn?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
      )}
    >
      <input
        type="radio"
        name="contract-delivery-method"
        className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
        checked={checked}
        onChange={onSelect}
      />
      <span>
        <span className="font-medium">{title}</span>
        <span
          className={cn(
            "mt-0.5 block text-xs",
            warn ? "text-warning" : "text-muted-foreground",
          )}
        >
          {description}
        </span>
      </span>
    </label>
  );
}

function ManualSignDialog({
  open,
  onClose,
  defaultSignerName,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  defaultSignerName: string;
  onSubmit: (input: { signerName: string; signedAt: string; note: string }) => void;
  pending: boolean;
}) {
  const [signerName, setSignerName] = React.useState(defaultSignerName);
  const [signedAt, setSignedAt] = React.useState(toISODate(new Date()));
  const [note, setNote] = React.useState("");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="書面締結の登録"
      description="紙の契約書等で締結済みの場合に、締結記録として登録します(電子署名の代替)。"
    >
      <div className="space-y-4">
        <Field label="署名者氏名">
          <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
        </Field>
        <Field label="締結日">
          <Input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
        </Field>
        <Field label="備考（原本の保管場所など）">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="例）押印済み原本を本社にて保管" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button
            onClick={() => onSubmit({ signerName: signerName.trim(), signedAt, note })}
            disabled={pending || !signerName.trim()}
          >
            登録する
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = React.useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="契約書の取消・無効化"
      description="署名リンクは無効化されます。証跡は保全され、この操作も記録されます。"
    >
      <div className="space-y-4">
        <Field label="取消理由">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例）条件変更のため作り直し"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={() => onSubmit(reason.trim())} disabled={pending}>
            <Ban className="h-4 w-4" />
            取消する
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function BillingDialog({
  open,
  onClose,
  hasPlan,
  hasInitialFee,
  defaultStartDate,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  hasPlan: boolean;
  hasInitialFee: boolean;
  defaultStartDate: string | null;
  onSubmit: (startedOn: string) => void;
  pending: boolean;
}) {
  const [startedOn, setStartedOn] = React.useState(defaultStartDate ?? toISODate(new Date()));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="請求の開始"
      description="締結済みの契約内容に基づいて請求を自動作成します。"
    >
      <div className="space-y-4">
        <ul className="list-inside list-disc rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
          {hasPlan && <li>定期契約を作成し、翌月分から毎月の請求書を自動生成します</li>}
          {(hasPlan || hasInitialFee) && (
            <li>
              初期費用＋初月日割り(利用開始日〜月末)の請求書(銀行振込)を作成・送付済にします
            </li>
          )}
          <li>支払方法を口座振替に設定します(翌月以降は引き落とし)</li>
        </ul>
        <Field label="利用開始日">
          <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button onClick={() => onSubmit(startedOn)} disabled={pending || !startedOn}>
            <Rocket className="h-4 w-4" />
            請求を開始する
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
