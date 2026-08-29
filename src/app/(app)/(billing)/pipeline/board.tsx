"use client";

import {
  ArrowRight,
  CalendarClock,
  CircleCheck,
  ExternalLink,
  History,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
  moveOnboardingCardAction,
  syncOnboardingStagesAction,
  updateOnboardingCardAction,
} from "@/app/actions/onboarding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import {
  contractStatusLabels,
  invoiceStatusLabels,
  mandateStatusLabels,
} from "@/lib/domain/constants";
import {
  ONBOARDING_CHECKLIST,
  ONBOARDING_STAGES,
  onboardingStageDescriptions,
  onboardingStageLabels,
  onboardingStageTone,
} from "@/lib/domain/onboarding";
import type {
  ContractStatus,
  InvoiceStatus,
  MandateStatus,
  OnboardingChecklistItem,
  OnboardingStage,
  OnboardingStageEvent,
  PaymentMethod,
} from "@/lib/domain/types";
import { cn, daysUntil, formatDate, formatDateTime, formatJPY } from "@/lib/utils";

/** カンバンカードの表示用データ(サーバーで実データのシグナルまで算出済み) */
export interface PipelineCard {
  id: string;
  customerId: string;
  name: string;
  code: string;
  assignee: string;
  paymentMethod: PaymentMethod;
  stage: OnboardingStage;
  dueDate: string | null;
  nextAction: string;
  checklist: OnboardingChecklistItem[];
  stageChangedAt: string;
  history: OnboardingStageEvent[];
  /** 現在の月額(税込) */
  monthlyFee: number;
  /** 累計入金(LTV) */
  ltvTotal: number;
  outstanding: number;
  overdueCount: number;
  contractStatus: ContractStatus | null;
  initialInvoiceId: string | null;
  initialInvoiceStatus: InvoiceStatus | null;
  mandateStatus: MandateStatus | null;
  subscriptionActive: boolean;
  recommendedStage: OnboardingStage;
}

/** 滞留日数(ステージに入ってからの日数) */
function daysInStage(card: PipelineCard): number {
  return Math.max(0, -daysUntil(card.stageChangedAt.slice(0, 10)));
}

export function PipelineBoard({ initialCards }: { initialCards: PipelineCard[] }) {
  const router = useRouter();
  const [cards, setCards] = React.useState(initialCards);
  const [query, setQuery] = React.useState("");
  const [dueOnly, setDueOnly] = React.useState(false);
  const [showClosed, setShowClosed] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{
    stage: OnboardingStage;
    beforeId: string | null;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  // サーバーの再描画(router.refresh)後に最新データを反映する
  React.useEffect(() => setCards(initialCards), [initialCards]);

  const q = query.trim().toLowerCase();
  const matches = (c: PipelineCard) =>
    (!q ||
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.assignee.toLowerCase().includes(q)) &&
    (!dueOnly || (!!c.dueDate && daysUntil(c.dueDate) < 0));

  const stages = ONBOARDING_STAGES.filter((s) => s !== "closed" || showClosed);
  const mismatched = cards.filter(
    (c) => c.stage !== c.recommendedStage && c.stage !== "closed",
  );
  const selected = cards.find((c) => c.id === selectedId) ?? null;

  /** カードを移動した新しい配列と、移動先列の並び(ID)を返す */
  const moveInState = (
    list: PipelineCard[],
    cardId: string,
    toStage: OnboardingStage,
    beforeId: string | null,
  ): { next: PipelineCard[]; orderedIds: string[] } | null => {
    const card = list.find((c) => c.id === cardId);
    if (!card) return null;
    const moved = { ...card, stage: toStage };
    const without = list.filter((c) => c.id !== cardId);
    let insertAt = without.length;
    if (beforeId) {
      const idx = without.findIndex((c) => c.id === beforeId);
      if (idx >= 0) insertAt = idx;
    } else {
      // 列の末尾へ(列にカードが無ければ配列末尾)
      let last = -1;
      without.forEach((c, i) => {
        if (c.stage === toStage) last = i;
      });
      insertAt = last === -1 ? without.length : last + 1;
    }
    const next = [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
    const orderedIds = next.filter((c) => c.stage === toStage).map((c) => c.id);
    return { next, orderedIds };
  };

  const commitMove = (cardId: string, toStage: OnboardingStage, beforeId: string | null) => {
    const snapshot = cards;
    const res = moveInState(cards, cardId, toStage, beforeId);
    if (!res) return;
    setCards(res.next);
    setError(null);
    start(async () => {
      const r = await moveOnboardingCardAction(cardId, toStage, res.orderedIds);
      if (!r.ok) {
        setCards(snapshot);
        setError(r.error);
        return;
      }
      router.refresh();
    });
  };

  const handleDrop = (stage: OnboardingStage, beforeId: string | null) => {
    if (!dragId) return;
    if (beforeId === dragId) {
      setDragId(null);
      setDropTarget(null);
      return;
    }
    commitMove(dragId, stage, beforeId);
    setDragId(null);
    setDropTarget(null);
  };

  // スマホでは6列を横に並べても読めないため、1ステージずつ切り替えて表示する
  const [mobileStage, setMobileStage] = React.useState<OnboardingStage>(stages[0]);
  // 「休止・解約を表示」を切ったときに、消えた列を選んだままにしない
  const activeStage = stages.includes(mobileStage) ? mobileStage : stages[0];

  const syncAll = () => {
    if (mismatched.length === 0) return;
    if (
      !window.confirm(
        `${mismatched.length}件のカードを、契約・請求・入金・口座振替の実データから見た推奨ステージへ移動します。よろしいですか？`,
      )
    )
      return;
    setError(null);
    start(async () => {
      const r = await syncOnboardingStagesAction(
        mismatched.map((c) => ({ id: c.id, stage: c.recommendedStage })),
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* ツールバー */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="顧客名・コード・担当で検索"
            aria-label="顧客を検索"
            className="pl-9 md:h-9 md:w-64"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={dueOnly}
              onChange={(e) => setDueOnly(e.target.checked)}
              className="h-5 w-5 accent-[hsl(var(--primary))] md:h-4 md:w-4"
            />
            期日超過のみ
          </label>
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
              className="h-5 w-5 accent-[hsl(var(--primary))] md:h-4 md:w-4"
            />
            休止・解約を表示
          </label>
        </div>
        <div className="hidden flex-1 md:block" />
        {mismatched.length > 0 && (
          <Button variant="outline" size="sm" onClick={syncAll} disabled={pending}>
            <RefreshCw className="h-4 w-4" />
            実データと同期（{mismatched.length}件のズレ）
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {cards.length === 0 ? (
        <EmptyState
          title="管理する顧客がまだいません"
          description="顧客を登録すると、実データ(契約・請求・入金・口座振替)から推定したステージでカードが自動作成されます。"
          action={
            <Link href="/customers" className="text-sm text-primary hover:underline">
              顧客管理へ
            </Link>
          }
        />
      ) : (
        <>
          {/* スマホ: ステージを1つずつ切り替える(6列の横スクロールは追えないため) */}
          <div className="snap-rail -mx-1 gap-1.5 px-1 md:hidden" role="tablist" aria-label="ステージ">
            {stages.map((stage) => {
              const count = cards.filter((c) => c.stage === stage && matches(c)).length;
              const active = stage === activeStage;
              return (
                <button
                  key={stage}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileStage(stage)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground active:bg-muted/70",
                  )}
                >
                  {onboardingStageLabels[stage]}
                  <span className={cn("tabular", active ? "opacity-80" : "opacity-70")}>{count}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground md:hidden">
            カードをタップすると詳細が開き、そこでステージを変更できます。
          </p>

          <div className="min-h-0 flex-1 overflow-x-auto pb-2 scrollbar-thin">
          <div className="flex items-start gap-3">
            {stages.map((stage) => {
              const colCards = cards.filter((c) => c.stage === stage && matches(c));
              const monthlyTotal = colCards.reduce((s, c) => s + c.monthlyFee, 0);
              const isOver = dropTarget?.stage === stage;
              return (
                <div
                  key={stage}
                  className={cn(
                    "flex w-full shrink-0 flex-col rounded-lg border border-border bg-muted/40 md:w-[276px]",
                    // スマホは選択中のステージだけを画面幅いっぱいに出す
                    stage === activeStage ? "flex" : "hidden md:flex",
                    isOver && "border-primary/60 bg-primary/5",
                  )}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    if (dropTarget?.stage !== stage || dropTarget.beforeId !== null) {
                      // カード上でなければ列末尾への挿入
                      setDropTarget((t) =>
                        t?.stage === stage && t.beforeId !== null ? t : { stage, beforeId: null },
                      );
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(stage, dropTarget?.stage === stage ? dropTarget.beforeId : null);
                  }}
                >
                  {/* 列ヘッダ */}
                  <div
                    className="flex items-center gap-2 px-3 pb-1 pt-2.5"
                    title={onboardingStageDescriptions[stage]}
                  >
                    <Badge tone={onboardingStageTone[stage]} dot>
                      {onboardingStageLabels[stage]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{colCards.length}件</span>
                    <span className="ml-auto tabular text-[11px] text-muted-foreground">
                      月額計 {formatJPY(monthlyTotal)}
                    </span>
                  </div>
                  <p className="px-3 pb-2 text-[11px] leading-snug text-muted-foreground/80">
                    {onboardingStageDescriptions[stage]}
                  </p>

                  {/* カード */}
                  <div className="flex flex-col gap-2 px-2 pb-2">
                    {colCards.map((card) => (
                      <CardView
                        key={card.id}
                        card={card}
                        dragging={dragId === card.id}
                        dropBefore={
                          dropTarget?.stage === stage && dropTarget.beforeId === card.id
                        }
                        onDragStart={() => setDragId(card.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setDropTarget(null);
                        }}
                        onDragOver={(e) => {
                          if (!dragId || dragId === card.id) return;
                          e.preventDefault();
                          e.stopPropagation();
                          setDropTarget({ stage, beforeId: card.id });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDrop(stage, card.id);
                        }}
                        onOpen={() => setSelectedId(card.id)}
                        onSuggest={() => commitMove(card.id, card.recommendedStage, null)}
                        pending={pending}
                      />
                    ))}
                    {/* 列末尾のドロップ領域 */}
                    <div
                      className={cn(
                        "rounded-md border border-dashed border-transparent py-1 text-center text-[11px] text-muted-foreground/0 transition-colors",
                        dragId && "min-h-9 border-border/70 text-muted-foreground/70",
                        isOver && dropTarget?.beforeId === null && "border-primary bg-primary/10 text-primary",
                      )}
                    >
                      ここにドロップ
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </>
      )}

      {selected && (
        <CardDialog
          card={selected}
          onClose={() => setSelectedId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

/* ---------------- カード ---------------- */

function CardView({
  card,
  dragging,
  dropBefore,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpen,
  onSuggest,
  pending,
}: {
  card: PipelineCard;
  dragging: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onOpen: () => void;
  onSuggest: () => void;
  pending: boolean;
}) {
  const overdue = !!card.dueDate && daysUntil(card.dueDate) < 0;
  const stay = daysInStage(card);
  const checklist = stageChecklist(card, card.stage);
  const doneCount = checklist.filter((c) => c.done).length;
  const suggest = card.recommendedStage !== card.stage;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onOpen}
      className={cn(
        "cursor-grab rounded-md border border-border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md",
        dragging && "opacity-40",
        dropBefore && "border-t-2 border-t-primary",
        overdue && "border-destructive/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/customers/${card.customerId}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-sm font-semibold hover:text-primary hover:underline"
          >
            {card.name}
          </Link>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="tabular">{card.code}</span>
            {card.assignee && <span>・{card.assignee}</span>}
          </div>
        </div>
        {card.monthlyFee > 0 && (
          <span className="tabular whitespace-nowrap text-xs font-semibold text-foreground">
            {formatJPY(card.monthlyFee)}
            <span className="text-[10px] font-normal text-muted-foreground">/月</span>
          </span>
        )}
      </div>

      {/* 実データ連動のシグナル */}
      <div className="mt-2 flex flex-wrap gap-1">
        <SignalChip
          label="契約"
          ok={card.contractStatus === "signed"}
          warn={card.contractStatus === "sent" || card.contractStatus === "viewed"}
          detail={card.contractStatus ? contractStatusLabels[card.contractStatus] : "未作成"}
        />
        <SignalChip
          label="初回請求"
          ok={card.initialInvoiceStatus === "paid"}
          warn={!!card.initialInvoiceStatus && card.initialInvoiceStatus !== "paid"}
          detail={
            card.initialInvoiceStatus ? invoiceStatusLabels[card.initialInvoiceStatus] : "未発行"
          }
        />
        {card.paymentMethod === "direct_debit" ? (
          <SignalChip
            label="振替"
            ok={card.mandateStatus === "active"}
            warn={card.mandateStatus === "pending"}
            danger={card.mandateStatus === "failed"}
            detail={card.mandateStatus ? mandateStatusLabels[card.mandateStatus] : "未登録"}
          />
        ) : (
          <SignalChip label="振替" ok={false} warn={false} detail="対象外(振込等)" muted />
        )}
        <SignalChip
          label="定期"
          ok={card.subscriptionActive}
          warn={false}
          detail={card.subscriptionActive ? "稼働中" : "未開始"}
        />
      </div>

      {/* チェックリスト進捗(現在ステージ) + メタ情報 */}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        {checklist.length > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              doneCount === checklist.length && "text-success",
            )}
            title={`このステージのチェックリスト ${doneCount}/${checklist.length}`}
          >
            <CircleCheck className="h-3.5 w-3.5" />
            {doneCount}/{checklist.length}
          </span>
        )}
        <span title="このステージに入ってからの日数">滞留 {stay}日</span>
        {card.dueDate && (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              overdue && "font-medium text-destructive",
            )}
            title="フォロー期日"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {formatDate(card.dueDate)}
            {overdue && `(${Math.abs(daysUntil(card.dueDate))}日超過)`}
          </span>
        )}
        {card.outstanding > 0 && (
          <span className="tabular ml-auto font-medium text-warning" title="未収金">
            未収 {formatJPY(card.outstanding)}
          </span>
        )}
      </div>

      {card.nextAction && (
        <p className="mt-1.5 truncate rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground" title={card.nextAction}>
          次: {card.nextAction}
        </p>
      )}

      {/* 実データからの推奨ステージ */}
      {suggest && (
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            onSuggest();
          }}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-md border border-warning/50 bg-warning/10 px-2 py-1 text-[11px] font-medium text-[hsl(38_92%_32%)] transition-colors hover:bg-warning/20 disabled:opacity-50 dark:text-warning"
          title="契約・請求・入金・口座振替の実データから見た推奨ステージへ移動"
        >
          <Sparkles className="h-3.5 w-3.5" />
          推奨: {onboardingStageLabels[card.recommendedStage]} へ移動
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function SignalChip({
  label,
  ok,
  warn,
  danger,
  detail,
  muted,
}: {
  label: string;
  ok: boolean;
  warn: boolean;
  danger?: boolean;
  detail: string;
  muted?: boolean;
}) {
  return (
    <span
      title={`${label}: ${detail}`}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        ok
          ? "bg-success/12 text-success"
          : danger
            ? "bg-destructive/12 text-destructive"
            : warn
              ? "bg-warning/15 text-[hsl(38_92%_32%)] dark:text-warning"
              : "bg-muted text-muted-foreground",
        muted && "opacity-60",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          ok
            ? "bg-success"
            : danger
              ? "bg-destructive"
              : warn
                ? "bg-warning"
                : "bg-muted-foreground/50",
        )}
      />
      {label}
    </span>
  );
}

/** 指定ステージのチェックリスト項目のみ抽出 */
function stageChecklist(card: PipelineCard, stage: OnboardingStage) {
  const keys = ONBOARDING_CHECKLIST.filter((c) => c.stage === stage).map((c) => c.key);
  return card.checklist.filter((c) => keys.includes(c.key));
}

/* ---------------- カード詳細ダイアログ ---------------- */

function CardDialog({
  card,
  onClose,
  onChanged,
}: {
  card: PipelineCard;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [checklist, setChecklist] = React.useState(card.checklist);
  const [dueDate, setDueDate] = React.useState(card.dueDate ?? "");
  const [nextAction, setNextAction] = React.useState(card.nextAction);
  const [saved, setSaved] = React.useState(false);

  // 別カードを開いたときだけ入力欄を差し替える。同一カードの再描画(チェック保存後の
  // リフレッシュ等)では、編集中の期日・メモを消さないよう card.id のみを依存にする。
  const cardId = card.id;
  React.useEffect(() => {
    setChecklist(card.checklist);
    setDueDate(card.dueDate ?? "");
    setNextAction(card.nextAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const run = (input: Parameters<typeof updateOnboardingCardAction>[1], after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await updateOnboardingCardAction(card.id, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      after?.();
      onChanged();
    });

  const toggle = (key: string, done: boolean) => {
    setChecklist((prev) => prev.map((c) => (c.key === key ? { ...c, done } : c)));
    run({ checklist: [{ key, done }] });
  };

  const saveMeta = () =>
    run({ dueDate: dueDate || null, nextAction }, () => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    });

  const stages = ONBOARDING_STAGES;

  return (
    <Dialog
      open
      onClose={onClose}
      title={card.name}
      description={`${card.code}${card.assignee ? ` ・ 担当: ${card.assignee}` : ""} ・ 月額 ${formatJPY(card.monthlyFee)} ・ LTV ${formatJPY(card.ltvTotal)}`}
      className="max-w-2xl"
    >
      <div className="space-y-5">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* ステージ + リンク */}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="ステージ" className="w-52">
            <Select
              value={card.stage}
              disabled={pending}
              onChange={(e) => run({ stage: e.target.value as OnboardingStage })}
            >
              {stages.map((s) => (
                <option key={s} value={s}>
                  {onboardingStageLabels[s]}
                </option>
              ))}
            </Select>
          </Field>
          {card.recommendedStage !== card.stage && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run({ stage: card.recommendedStage })}
            >
              <Sparkles className="h-4 w-4" />
              推奨({onboardingStageLabels[card.recommendedStage]})へ
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3 pb-1 text-sm">
            <Link
              href={`/customers/${card.customerId}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              顧客詳細 <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            {card.initialInvoiceId && (
              <Link
                href={`/invoices/${card.initialInvoiceId}`}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                初回請求書 <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* チェックリスト(ステージごと) */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">チェックリスト</h3>
          <div className="space-y-2.5">
            {stages
              .filter((s) => ONBOARDING_CHECKLIST.some((c) => c.stage === s))
              .map((s) => {
                const keys = ONBOARDING_CHECKLIST.filter((c) => c.stage === s).map((c) => c.key);
                const items = checklist.filter((c) => keys.includes(c.key));
                return (
                  <div
                    key={s}
                    className={cn(
                      "rounded-md border border-border p-2.5",
                      s === card.stage && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge tone={onboardingStageTone[s]}>{onboardingStageLabels[s]}</Badge>
                      {s === card.stage && (
                        <span className="text-[11px] text-primary">現在のステージ</span>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {items.map((item) => (
                        <li key={item.key}>
                          <label className="flex cursor-pointer items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={item.done}
                              disabled={pending}
                              onChange={(e) => toggle(item.key, e.target.checked)}
                              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                            />
                            <span
                              className={cn(
                                item.done && "text-muted-foreground line-through",
                              )}
                            >
                              {item.label}
                              {item.done && item.doneBy && (
                                <span className="ml-1.5 text-[11px] no-underline">
                                  （{item.doneBy}・{formatDate(item.doneAt)}）
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        </div>

        {/* 期日・次にやること */}
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="フォロー期日">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="次にやること">
            <Textarea
              rows={2}
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="例: 振替依頼書の返送を電話で確認する"
            />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2">
          {saved && <span className="text-xs text-success">保存しました</span>}
          <Button size="sm" onClick={saveMeta} disabled={pending}>
            期日・メモを保存
          </Button>
        </div>

        {/* ステージ履歴 */}
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <History className="h-4 w-4 text-muted-foreground" />
            ステージ履歴
          </h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {[...card.history].reverse().map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge tone={onboardingStageTone[h.stage]}>
                  {onboardingStageLabels[h.stage]}
                </Badge>
                <span>{formatDateTime(h.at)}</span>
                <span>・ {h.by}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
