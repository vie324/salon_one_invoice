import * as React from "react";
import type { BadgeTone } from "@/lib/domain/constants";
import { cn } from "@/lib/utils";

/**
 * 進捗バー。「いまどこまで進んでいるか」を1本の帯で示す。
 * 色は globals.css のセマンティックカラーに揃える(Tailwind が拾えるよう静的な表で持つ)。
 */
const fillTone: Record<BadgeTone, string> = {
  neutral: "bg-muted-foreground/40",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
};

const dotTone: Record<BadgeTone, string> = {
  neutral: "bg-muted-foreground/40",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
};

/**
 * 達成率バー(1本)。「入金 ¥X / 請求 ¥Y」のような進捗を1行で示す。
 * max が 0 のときは 0% として描く(ゼロ除算・NaN 幅を避ける)。
 */
export function ProgressBar({
  value,
  max,
  tone = "primary",
  label,
  valueLabel,
  ariaLabel,
  className,
}: {
  value: number;
  max: number;
  tone?: BadgeTone;
  /** バーの左上に出す説明 */
  label?: React.ReactNode;
  /** バーの右上に出す実績値 */
  valueLabel?: React.ReactNode;
  /** 読み上げ用の名前(label が文字列でない場合に指定する) */
  ariaLabel?: string;
  className?: string;
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const percent = Math.round(ratio * 100);
  return (
    <div className={className}>
      {(label || valueLabel) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
          {label && <span className="min-w-0 truncate text-muted-foreground">{label}</span>}
          {valueLabel && <span className="tabular shrink-0 font-medium">{valueLabel}</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", fillTone[tone])}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

/** 積み上げバーの1区間 */
export interface BarSegment {
  label: string;
  value: number;
  tone: BadgeTone;
}

/**
 * 積み上げバー + 凡例。「未対応 / 対応中 / 追加ヒアリング」のように
 * 全体の内訳(＝どこで止まっているか)を1画面で読ませる。
 */
export function SegmentedBar({
  segments,
  unit = "件",
  emptyLabel = "対象がありません",
  className,
}: {
  segments: BarSegment[];
  unit?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const visible = segments.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{emptyLabel}</p>;
  }

  return (
    <div className={className}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {visible.map((s) => (
          <div
            key={s.label}
            className={fillTone[s.tone]}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label} ${s.value}${unit}`}
          />
        ))}
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {visible.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", dotTone[s.tone])} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="tabular shrink-0 font-medium">
              {s.value}
              {unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
