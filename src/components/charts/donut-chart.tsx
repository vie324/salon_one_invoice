"use client";

import * as React from "react";
import { formatJPY, formatPercent } from "@/lib/utils";

export interface DonutSlice {
  label: string;
  value: number;
  /** chart-1..5 のインデックス(1始まり) */
  colorIndex: number;
}

const strokeClass: Record<number, string> = {
  1: "stroke-chart-1",
  2: "stroke-chart-2",
  3: "stroke-chart-3",
  4: "stroke-chart-4",
  5: "stroke-chart-5",
};
const bgClass: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

/** カテゴリ内訳のドーナツ。凡例に金額・比率を直接表示(色のみに依存しない)。 */
export function DonutChart({ slices, centerLabel }: { slices: DonutSlice[]; centerLabel?: string }) {
  const [active, setActive] = React.useState<number | null>(null);
  const total = slices.reduce((s, d) => s + d.value, 0);
  const size = 168;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && slices.length > 1 ? 2 : 0; // セグメント間の隙間(px)

  let offset = 0;
  const segs = slices.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const len = Math.max(0, frac * c - gap);
    const seg = { ...s, dasharray: `${len} ${c - len}`, dashoffset: -offset };
    offset += frac * c;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted" strokeWidth={stroke} />
          {total > 0 &&
            segs.map((s, i) => (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                className={strokeClass[s.colorIndex]}
                strokeWidth={active === i ? stroke + 3 : stroke}
                strokeDasharray={s.dasharray}
                strokeDashoffset={s.dashoffset}
                strokeLinecap="butt"
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                style={{ transition: "stroke-width .12s" }}
              />
            ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-muted-foreground">{centerLabel ?? "合計"}</span>
          <span className="tabular text-lg font-semibold">{formatJPY(total)}</span>
        </div>
      </div>

      <ul className="w-full space-y-1.5">
        {slices.map((s, i) => (
          <li
            key={s.label}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            style={{ background: active === i ? "hsl(var(--muted))" : undefined }}
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className={`h-2.5 w-2.5 rounded-sm ${bgClass[s.colorIndex]}`} />
              {s.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="tabular font-medium text-foreground">{formatJPY(s.value)}</span>
              <span className="tabular w-10 text-right text-xs text-muted-foreground">
                {total > 0 ? formatPercent(s.value / total, 0) : "—"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
