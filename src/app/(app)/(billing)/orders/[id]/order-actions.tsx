"use client";

import { CheckCircle2, Mail, PauseCircle, PlayCircle, Rocket, Save, Send, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { sendInvoiceAction } from "@/app/actions/invoices";
import {
  clearLegacyBankInfoAction,
  confirmOrderAction,
  recordNssStepAction,
  setOrderClosedAction,
  toggleOrderChecklistAction,
  updateOrderNoteAction,
  type NssStep,
} from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { prorateMonthly, taxAmount } from "@/lib/domain/calculations";
import type { ManualChecklistKey } from "@/lib/domain/onboarding";
import { addMonths, currentMonth, formatJPY, toISODate } from "@/lib/utils";

/* ---------------------------------------------------------------- 受注確定 */

export interface ConfirmPreview {
  contractId: string;
  contractNumber: string;
  planName: string;
  storeCount: number;
  /** 初期費用(税抜) */
  initialFee: number;
  /** 月額合計(税抜・全店舗) */
  monthlyFee: number;
  taxRate: number;
  /** 紹介特典(初月日割り無料＋2ヶ月無料)の対象か */
  referred: boolean;
  /** 代理店報酬の見込み(代理店経由のときだけ) */
  agencyCommission: { agencyName: string; label: string; amount: number } | null;
  customerEmail: string;
  emailReady: boolean;
  defaultStartDate: string | null;
}

/** 受注確定の結果を ConfirmResultNotice へ渡すイベント */
const ORDER_CONFIRMED_EVENT = "salonone:order-confirmed";

/**
 * 受注確定の結果(作ったもの・初回請求書のメール送付結果)を表示する。
 * 確定すると「受注を確定する」の行は完了に変わってボタンごと消えるため、
 * 結果はページに常に置いてあるこの部品で表示する(ボタン側のダイアログでは消えてしまう)。
 */
export function ConfirmResultNotice() {
  const [result, setResult] = React.useState<string | null>(null);
  React.useEffect(() => {
    const onConfirmed = (e: Event) => setResult((e as CustomEvent<string>).detail);
    window.addEventListener(ORDER_CONFIRMED_EVENT, onConfirmed);
    return () => window.removeEventListener(ORDER_CONFIRMED_EVENT, onConfirmed);
  }, []);
  return (
    <Dialog
      open={result !== null}
      onClose={() => setResult(null)}
      title="受注を確定しました"
      className="max-w-lg"
    >
      {result !== null && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-md bg-success/10 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span className="whitespace-pre-wrap">{result.split(" / ").join("\n")}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            続けて「導入準備」（初回請求書の送付・口座振替依頼書の郵送・初期設定）を進めてください。
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setResult(null)}>閉じる</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/**
 * 受注確定ボタン。押すと初回請求書(初期費用＋初月日割り)と毎月の請求(定期契約)が作られる。
 * 何が作られるかを確定前に見せてから実行する。結果は ConfirmResultNotice が表示する。
 */
export function ConfirmOrderButton({ preview }: { preview: ConfirmPreview }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [startedOn, setStartedOn] = React.useState(preview.defaultStartDate ?? toISODate(new Date()));
  const [emailInvoice, setEmailInvoice] = React.useState(
    preview.emailReady && Boolean(preview.customerEmail),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(startedOn);
  const proration = validDate ? prorateMonthly(preview.monthlyFee, startedOn) : null;
  const prorationCharged = preview.referred ? 0 : (proration?.amount ?? 0);
  const firstSubtotal = preview.initialFee + prorationCharged;
  const firstTotal = firstSubtotal + taxAmount(firstSubtotal, preview.taxRate);
  const monthlyWithTax = preview.monthlyFee + taxAmount(preview.monthlyFee, preview.taxRate);
  const firstRecurringMonth = validDate
    ? addMonths(startedOn.slice(0, 7), preview.referred ? 3 : 1)
    : null;

  const confirm = () =>
    start(async () => {
      setError(null);
      const res = await confirmOrderAction(preview.contractId, { startedOn, emailInvoice });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      window.dispatchEvent(
        new CustomEvent(ORDER_CONFIRMED_EVENT, {
          detail: res.emailResult ? `${res.detail} / ${res.emailResult}` : res.detail,
        }),
      );
      router.refresh();
    });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Rocket className="h-4 w-4" />
        受注を確定する
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="受注を確定する"
        description="契約書第3条の「承諾」にあたります。確定すると下記がまとめて作られます。"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <Field
            label="利用開始日"
            hint="この日から月末までを初月の日割りとして初回請求に含めます。翌月分からは毎月の請求（口座振替）です。"
          >
            <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
          </Field>

          <div className="space-y-1.5 rounded-md border border-border p-3 text-sm">
            <div className="font-semibold">作られるもの</div>
            <Line label={`初回請求書（銀行振込）`} value={`${formatJPY(firstTotal)}（税込）`} strong />
            <Line label={`　初期費用`} value={formatJPY(preview.initialFee)} />
            <Line
              label={`　初月日割り${proration ? `（${proration.label}）` : ""}`}
              value={
                preview.referred
                  ? `${formatJPY(0)}（ご紹介特典で無料）`
                  : formatJPY(proration?.amount ?? 0)
              }
            />
            <Line
              label={`毎月の請求（口座振替）${preview.storeCount > 1 ? `・${preview.storeCount}店舗` : ""}`}
              value={`${formatJPY(monthlyWithTax)}（税込）`}
              strong
            />
            {firstRecurringMonth && (
              <p className="text-xs text-muted-foreground">
                {firstRecurringMonth.replace("-", "年")}月分から自動で作成されます
                {preview.referred ? "（ご紹介特典で2ヶ月分は無料）" : ""}。
              </p>
            )}
            {preview.agencyCommission && (
              <Line
                label={`代理店報酬（${preview.agencyCommission.agencyName}・${preview.agencyCommission.label}）`}
                value={formatJPY(preview.agencyCommission.amount)}
              />
            )}
            {preview.agencyCommission && (
              <p className="text-xs text-muted-foreground">
                代理店報酬は、お客様の初期費用の入金を確認した月の支払明細に計上されます。
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
              checked={emailInvoice}
              disabled={!preview.emailReady || !preview.customerEmail}
              onChange={(e) => setEmailInvoice(e.target.checked)}
            />
            <span>
              初回請求書をそのままメールで送る
              <span className="block text-xs text-muted-foreground">
                {!preview.emailReady
                  ? "メール送信が未設定のため送れません（郵送・手渡ししたら、案件ページの「初回請求書をお客様へ送付」を「完了にする」）"
                  : !preview.customerEmail
                    ? "お客様のメールアドレスが未登録です"
                    : `送付先: ${preview.customerEmail}`}
              </span>
            </span>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={confirm} disabled={pending || !validDate}>
              <Rocket className="h-4 w-4" />
              {pending ? "確定中…" : "受注を確定する"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "tabular font-semibold" : "tabular"}>{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- 手で付けるチェック */

export function ManualCheck({
  customerId,
  itemKey,
  done,
  disabled,
}: {
  customerId: string;
  itemKey: ManualChecklistKey;
  done: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const toggle = () =>
    start(async () => {
      setError(null);
      const res = await toggleOrderChecklistAction(customerId, itemKey, !done);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={done ? "ghost" : "outline"}
        onClick={toggle}
        disabled={pending || disabled}
      >
        {done ? (
          <>
            <Undo2 className="h-3.5 w-3.5" />
            取り消す
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" />
            完了にする
          </>
        )}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}

/** 初回請求書をメールで送り、「送付済み」にチェックする */
export function SendInvoiceButton({
  customerId,
  invoiceId,
  emailReady,
}: {
  customerId: string;
  invoiceId: string;
  emailReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(null);
  const send = () =>
    start(async () => {
      const res = await sendInvoiceAction(invoiceId, { email: true });
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      const sentOk = Boolean(res.emailResult && !res.emailResult.includes("失敗") && !res.emailResult.includes("未登録"));
      if (sentOk) await toggleOrderChecklistAction(customerId, "initial_invoice_sent", true);
      setMessage(res.emailResult ?? "送付しました");
      router.refresh();
    });
  if (!emailReady) return null;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" onClick={send} disabled={pending}>
        <Mail className="h-3.5 w-3.5" />
        {pending ? "送信中…" : "メールで送付"}
      </Button>
      {message && <span className="max-w-[16rem] text-right text-xs text-muted-foreground">{message}</span>}
    </span>
  );
}

/* ---------------------------------------------------------------- NSS の手続き */

const NSS_STEP_LABELS: Record<NssStep, string> = {
  form_sent: "郵送した",
  form_received: "回収した",
  submitted: "NSSへ登録した",
  registered: "登録完了",
  rejected: "不備あり",
  revoked: "停止・解約",
  reset: "やり直す",
};

/**
 * 口座振替(NSS)の手続きを1ステップ記録するボタン。日付(既定は今日)を確認してから記録する。
 * 「登録完了」では振替開始月と NSS の顧客番号(任意)も記録する。
 */
export function NssStepButton({
  customerId,
  step,
  label,
  variant = "outline",
}: {
  customerId: string;
  step: NssStep;
  label?: string;
  variant?: "outline" | "primary" | "ghost";
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(toISODate(new Date()));
  const [month, setMonth] = React.useState(addMonths(currentMonth(), 1));
  const [nssNumber, setNssNumber] = React.useState("");
  const [note, setNote] = React.useState<string>(
    step === "revoked" ? "解約" : "依頼書の不備（登録未完了）",
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      const res = await recordNssStepAction(customerId, step, {
        date,
        ...(step === "registered" ? { debitStartMonth: month, nssCustomerNumber: nssNumber } : {}),
        ...(step === "rejected" || step === "revoked" ? { note } : {}),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });

  const needsDialog = step !== "reset";
  return (
    <>
      <Button
        size="sm"
        variant={variant}
        onClick={() => {
          if (needsDialog) setOpen(true);
          else if (window.confirm("口座振替(NSS)の手続きの記録を最初からやり直します。よろしいですか？")) run();
        }}
        disabled={pending}
      >
        {label ?? NSS_STEP_LABELS[step]}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`口座振替（NSS）: ${label ?? NSS_STEP_LABELS[step]}`}
      >
        <div className="space-y-4">
          {step !== "rejected" && step !== "revoked" && (
            <Field label="日付">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
          {step === "registered" && (
            <>
              <Field
                label="振替開始月"
                hint="NSS の登録完了通知に書かれている、引き落としが始まる月。これより前の月の請求は振込でお願いします。"
              >
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </Field>
              <Field label="NSS の顧客番号など（任意）" hint="照合用のメモです。">
                <Input value={nssNumber} onChange={(e) => setNssNumber(e.target.value)} />
              </Field>
            </>
          )}
          {(step === "rejected" || step === "revoked") && (
            <Field label={step === "rejected" ? "不備の内容" : "理由"}>
              <Select value={note} onChange={(e) => setNote(e.target.value)}>
                {step === "rejected" ? (
                  <>
                    <option>依頼書の不備（登録未完了）</option>
                    <option>印鑑相違</option>
                    <option>口座番号・名義の誤り</option>
                    <option>その他</option>
                  </>
                ) : (
                  <>
                    <option>解約</option>
                    <option>口座の変更</option>
                    <option>預金者からの停止依頼</option>
                    <option>その他</option>
                  </>
                )}
              </Select>
            </Field>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              キャンセル
            </Button>
            <Button onClick={run} disabled={pending}>
              <Send className="h-4 w-4" />
              記録する
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** 旧運用で保存していた口座番号などを消去する */
export function ClearBankInfoButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const clear = () => {
    if (!window.confirm("このツールに保存されている口座情報（銀行名・口座番号・名義）を消去します。NSS 側の登録には影響しません。よろしいですか？")) return;
    start(async () => {
      await clearLegacyBankInfoAction(customerId);
      router.refresh();
    });
  };
  return (
    <Button size="sm" variant="ghost" onClick={clear} disabled={pending}>
      口座情報を消去
    </Button>
  );
}

/* ---------------------------------------------------------------- メモ・休止 */

export function OrderNoteForm({
  customerId,
  dueDate,
  nextAction,
}: {
  customerId: string;
  dueDate: string | null;
  nextAction: string;
}) {
  const router = useRouter();
  const [due, setDue] = React.useState(dueDate ?? "");
  const [text, setText] = React.useState(nextAction);
  const [saved, setSaved] = React.useState(false);
  const [pending, start] = React.useTransition();
  const save = () =>
    start(async () => {
      const res = await updateOrderNoteAction(customerId, { dueDate: due || null, nextAction: text });
      if (res.ok) {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  return (
    <div className="space-y-3">
      <Field label="フォロー期日">
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <Field label="メモ（引き継ぎ・次にやること）">
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例: 依頼書の返送を10/15に電話で確認する"
        />
      </Field>
      <div className="flex items-center justify-end gap-2">
        {saved && <span className="text-xs text-success">保存しました</span>}
        <Button size="sm" onClick={save} disabled={pending}>
          <Save className="h-3.5 w-3.5" />
          保存
        </Button>
      </div>
    </div>
  );
}

export function CloseOrderButton({ customerId, closed }: { customerId: string; closed: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const toggle = () => {
    let reason: string | null = "";
    if (!closed) {
      reason = window.prompt(
        "休止・解約・見送りにします。理由をご記入ください（メモに残ります）。",
        "",
      );
      if (reason === null) return;
    }
    start(async () => {
      await setOrderClosedAction(customerId, !closed, reason ?? "");
      router.refresh();
    });
  };
  return (
    <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
      {closed ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
      {closed ? "案件を再開する" : "休止・見送りにする"}
    </Button>
  );
}
