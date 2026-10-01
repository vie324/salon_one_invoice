"use client";

import { agencyRateLabel } from "@/lib/domain/agency";
import { AGENCY_DEAL_TYPE_KEYS, AGENCY_DEAL_TYPES } from "@/lib/domain/constants";
import type { AgencyDealType } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** 代理店区分の選択(取次型 / 営業・初期設定型)。報酬率と担当範囲を一緒に見せる。 */
export function DealTypePicker({
  value,
  onChange,
}: {
  value: AgencyDealType;
  onChange: (value: AgencyDealType) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {AGENCY_DEAL_TYPE_KEYS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          aria-pressed={value === t}
          className={cn(
            "rounded-md border p-3 text-left transition-colors",
            value === t ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50",
          )}
        >
          <div className="text-sm font-semibold">
            {AGENCY_DEAL_TYPES[t].label}
            <span className="ml-1.5 text-primary">{agencyRateLabel(t)}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{AGENCY_DEAL_TYPES[t].scope}</div>
        </button>
      ))}
    </div>
  );
}
