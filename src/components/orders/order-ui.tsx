import { AlertTriangle, Check, Circle, Clock, Lock, Minus } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { agencyRateLabel } from "@/lib/domain/agency";
import { AGENCY_DEAL_TYPES, agencyDealTypeTone } from "@/lib/domain/constants";
import {
  ACTIVE_ONBOARDING_STAGES,
  onboardingStageDescriptions,
  onboardingStageLabels,
  onboardingStageOwner,
  onboardingStageTone,
  orderOwnerLabels,
  orderOwnerTone,
  type OrderOwner,
  type OrderStepItem,
} from "@/lib/domain/onboarding";
import type { AgencyDealType, OnboardingStage } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * 受注管理の共通部品(サーバー・クライアントどちらからも使える表示専用の部品)。
 */

export function StageBadge({ stage }: { stage: OnboardingStage }) {
  return (
    <Badge tone={onboardingStageTone[stage]} dot>
      {onboardingStageLabels[stage]}
    </Badge>
  );
}

export function OwnerBadge({ owner, label }: { owner: OrderOwner; label?: string }) {
  return (
    <Badge tone={orderOwnerTone[owner]} className="px-2 py-0 text-[10px]">
      {label ?? orderOwnerLabels[owner]}
    </Badge>
  );
}

export function DealTypeBadge({ dealType, withRate }: { dealType: AgencyDealType; withRate?: boolean }) {
  return (
    <Badge tone={agencyDealTypeTone[dealType]}>
      {AGENCY_DEAL_TYPES[dealType].label}
      {withRate ? `・${agencyRateLabel(dealType)}` : ""}
    </Badge>
  );
}

/** 申込・契約 → 受注確認 → 導入準備 → 運用中 の全体の流れ(現在地・件数つき) */
export function FlowStepper({
  current,
  counts,
  hrefFor,
  compact,
}: {
  current?: OnboardingStage;
  counts?: Partial<Record<OnboardingStage, number>>;
  hrefFor?: (stage: OnboardingStage) => string;
  compact?: boolean;
}) {
  const currentIndex = current ? ACTIVE_ONBOARDING_STAGES.indexOf(current) : -1;
  return (
    <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {ACTIVE_ONBOARDING_STAGES.map((stage, i) => {
        const isCurrent = stage === current;
        const isDone = currentIndex > i;
        const body = (
          <div
            className={cn(
              "relative h-full rounded-lg border p-3 transition-colors",
              isCurrent && "border-primary bg-primary/5 ring-1 ring-primary",
              isDone && "border-success/40 bg-success/5",
              !isCurrent && !isDone && "border-border bg-card",
              hrefFor && "hover:border-primary/60",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  isDone
                    ? "bg-success text-success-foreground"
                    : isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="text-sm font-semibold">{onboardingStageLabels[stage]}</span>
              {counts && (
                <span className="tabular ml-auto text-lg font-bold">{counts[stage] ?? 0}</span>
              )}
            </div>
            {!compact && (
              <>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                  {onboardingStageDescriptions[stage]}
                </p>
                <p className="mt-1 text-[11px] font-medium text-foreground/80">
                  担当: {onboardingStageOwner[stage]}
                </p>
              </>
            )}
          </div>
        );
        return (
          <li key={stage} aria-current={isCurrent ? "step" : undefined}>
            {hrefFor ? (
              <Link href={hrefFor(stage)} className="block h-full">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** チェック項目の状態アイコン */
export function StepIcon({ item }: { item: OrderStepItem }) {
  if (item.skipped) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Minus className="h-3 w-3" />
      </span>
    );
  }
  if (item.done) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-foreground">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (item.late) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="h-3 w-3" />
      </span>
    );
  }
  if (item.blocked) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="h-3 w-3" />
      </span>
    );
  }
  if (item.waiting) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-info/15 text-info">
        <Clock className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-warning text-warning">
      <Circle className="h-2 w-2 fill-current" />
    </span>
  );
}
