"use client";

import * as React from "react";
import type { MonthlyRevenuePoint } from "@/lib/domain/types";
import { formatCompactJPY, formatJPY } from "@/lib/utils";
import { useElementWidth } from "./use-width";

/**
 * 月次の「請求額(棒)」と「入金額(折れ線)」を単一Y軸で表示。
 * dataviz: 1軸 / 太すぎないマーク / 直接ラベルは凡例のみ / ホバー十字線。
 */
export function RevenueChart({ data }: { data: MonthlyRevenuePoint[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);

  const height = 260;
  const pad = { top: 16, right: 12, bottom: 28, left: 46 };
  const w = Math.max(width, 320);
  const plotW = w - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.invoiced, d.collected)));
  const niceMax = niceCeil(maxVal);
  const y = (v: number) => pad.top + plotH - (v / niceMax) * plotH;
  const bandW = plotW / data.length;
  const barW = Math.min(28, bandW * 0.42);
  const cx = (i: number) => pad.left + bandW * i + bandW / 2;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);
  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${cx(i).toFixed(1)} ${y(d.collected).toFixed(1)}`)
    .join(" ");

  const monthLabel = (m: string) => `${Number(m.split("-")[1])}月`;

  return (
    <div ref={ref} className="relative w-full">
      {/* 凡例 */}
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-chart-1" /> 請求額
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-chart-5" /> 入金額
        </span>
      </div>

      {width > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          aria-label="月次の請求額と入金額"
          onMouseLeave={() => setHover(null)}
        >
          {/* 目盛線 */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={pad.left}
                x2={w - pad.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {t === 0 ? "0" : formatCompactJPY(t)}
              </text>
            </g>
          ))}

          {/* ホバー列ハイライト */}
          {hover !== null && (
            <rect
              x={pad.left + bandW * hover}
              y={pad.top}
              width={bandW}
              height={plotH}
              className="fill-muted/50"
            />
          )}

          {/* 請求額の棒 */}
          {data.map((d, i) => {
            const barH = plotH - (y(d.invoiced) - pad.top);
            return (
              <rect
                key={i}
                x={cx(i) - barW / 2}
                y={y(d.invoiced)}
                width={barW}
                height={Math.max(0, barH)}
                rx={4}
                className="fill-chart-1"
              />
            );
          })}

          {/* 入金額の折れ線 + マーカー */}
          <path d={linePath} fill="none" className="stroke-chart-5" strokeWidth={2} />
          {data.map((d, i) => (
            <circle
              key={i}
              cx={cx(i)}
              cy={y(d.collected)}
              r={4}
              className="fill-chart-5 stroke-background"
              strokeWidth={2}
            />
          ))}

          {/* x軸ラベル + ホバー当たり判定 */}
          {data.map((d, i) => (
            <g key={i}>
              <text
                x={cx(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {monthLabel(d.month)}
              </text>
              <rect
                x={pad.left + bandW * i}
                y={pad.top}
                width={bandW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
        </svg>
      )}

      {/* ツールチップ */}
      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg"
          style={{ left: cx(hover), top: 4 }}
        >
          <div className="mb-1 font-medium text-foreground">{monthLabel(data[hover].month)}</div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-chart-1" />請求 {formatJPY(data[hover].invoiced)}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-chart-5" />入金 {formatJPY(data[hover].collected)}
          </div>
        </div>
      )}
    </div>
  );
}

function niceCeil(v: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
