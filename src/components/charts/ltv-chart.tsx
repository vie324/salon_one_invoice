"use client";

import * as React from "react";
import type { LtvPoint } from "@/lib/domain/ltv";
import { formatCompactJPY, formatJPY, formatMonthKey } from "@/lib/utils";
import { useElementWidth } from "./use-width";

/**
 * 顧客LTVチャート。
 * 「毎月いくら払っているか(棒・左軸)」と「累計いくらか=LTV(折れ線＋面・右軸)」を
 * ひと目で読めるようにする。単位は同じ円だがスケールが大きく異なるため2軸で表示し、
 * 凡例と軸ラベルで対応を明示する。
 */
export function LtvChart({ data }: { data: LtvPoint[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);

  const height = 240;
  const pad = { top: 16, right: 56, bottom: 28, left: 52 };
  // 目盛りとラベルが読める最小幅。これより狭い画面では横スクロールで見せる
  const w = Math.max(width, 300);
  const plotW = w - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxMonthly = Math.max(1, ...data.map((d) => d.amount));
  const maxCum = Math.max(1, ...data.map((d) => d.cumulative));
  const niceMonthly = niceCeil(maxMonthly);
  const niceCum = niceCeil(maxCum);

  const yL = (v: number) => pad.top + plotH - (v / niceMonthly) * plotH;
  const yR = (v: number) => pad.top + plotH - (v / niceCum) * plotH;
  const bandW = plotW / Math.max(1, data.length);
  const barW = Math.min(26, Math.max(6, bandW * 0.5));
  const cx = (i: number) => pad.left + bandW * i + bandW / 2;

  const ticks = [0, 0.5, 1];
  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${cx(i).toFixed(1)} ${yR(d.cumulative).toFixed(1)}`)
    .join(" ");
  const areaPath =
    data.length > 0
      ? `${linePath} L ${cx(data.length - 1).toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${cx(0).toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`
      : "";

  const monthLabel = (m: string) => {
    const [y, mm] = m.split("-");
    return Number(mm) === 1 ? `${y.slice(2)}/1` : `${Number(mm)}月`;
  };
  // ラベルが密になりすぎないよう間引く
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 46)));

  return (
    <div ref={ref} className="relative w-full overflow-x-auto scrollbar-thin">
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-chart-1" /> 月々の入金（左軸）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-chart-2" /> 累計LTV（右軸）
        </span>
      </div>

      {width > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          aria-label="月々の入金額と累計LTV"
          onMouseLeave={() => setHover(null)}
        >
          {/* 目盛線 + 左右軸ラベル */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={pad.left}
                x2={w - pad.right}
                y1={yL(t * niceMonthly)}
                y2={yL(t * niceMonthly)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={yL(t * niceMonthly)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {t === 0 ? "0" : formatCompactJPY(t * niceMonthly)}
              </text>
              <text
                x={w - pad.right + 8}
                y={yR(t * niceCum)}
                textAnchor="start"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {t === 0 ? "0" : formatCompactJPY(t * niceCum)}
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

          {/* 累計LTVの面(薄く) */}
          {areaPath && <path d={areaPath} className="fill-chart-2/10" />}

          {/* 月々の入金(棒) */}
          {data.map((d, i) => {
            const barH = plotH - (yL(d.amount) - pad.top);
            return (
              <rect
                key={i}
                x={cx(i) - barW / 2}
                y={yL(d.amount)}
                width={barW}
                height={Math.max(0, barH)}
                rx={3}
                className="fill-chart-1"
              />
            );
          })}

          {/* 累計LTV(折れ線) */}
          <path d={linePath} fill="none" className="stroke-chart-2" strokeWidth={2} />
          {data.map((d, i) =>
            data.length <= 24 || i === data.length - 1 ? (
              <circle
                key={i}
                cx={cx(i)}
                cy={yR(d.cumulative)}
                r={i === data.length - 1 ? 4 : 3}
                className="fill-chart-2 stroke-background"
                strokeWidth={2}
              />
            ) : null,
          )}

          {/* x軸ラベル + ホバー当たり判定 */}
          {data.map((d, i) => (
            <g key={i}>
              {(i % labelEvery === 0 || i === data.length - 1) && (
                <text
                  x={cx(i)}
                  y={height - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {monthLabel(d.month)}
                </text>
              )}
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
          style={{ left: Math.min(Math.max(cx(hover), 90), w - 90), top: 4 }}
        >
          <div className="mb-1 font-medium text-foreground">
            {formatMonthKey(data[hover].month)}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm bg-chart-1" />
            月々 {formatJPY(data[hover].amount)}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-chart-2" />
            累計 {formatJPY(data[hover].cumulative)}
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
